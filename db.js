// db.js
const { app } = require("electron");
const sqlite3 = require("sqlite3");
const path = require("path");
const { promisify } = require("util");

class TrainingDB {
  constructor() {
    this.db = null;
    this.initialized = false;
    this.initializeDB();
  }

  async initializeDB() {
    try {
      if (this.initialized) return;

      const dbPath = path.join(__dirname, "training.db");
      console.log("Database path:", dbPath);

      this.db = new sqlite3.Database(dbPath);
      this.db.run = promisify(this.db.run.bind(this.db));
      this.db.exec = promisify(this.db.exec.bind(this.db));
      this.db.all = promisify(this.db.all.bind(this.db));
      this.db.get = promisify(this.db.get.bind(this.db));

      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS unlabeled_killmails (
          killmail_id INTEGER PRIMARY KEY,
          solar_system_id INTEGER NOT NULL,
          killmail_time TEXT NOT NULL,
          is_at_stargate BOOLEAN,
          nearest_celestial TEXT,
          ship_type_id INTEGER,
          zkill_data TEXT,
          added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS labeled_killmails (
          killmail_id INTEGER PRIMARY KEY,
          solar_system_id INTEGER NOT NULL,
          killmail_time TEXT NOT NULL,
          nearest_celestial TEXT,
          ship_type_id INTEGER,
          zkill_data TEXT,
          is_camp BOOLEAN NOT NULL,
          labeled_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log("Training database initialized");
      this.initialized = true;
    } catch (error) {
      console.error("Database initialization error:", error);
      throw error;
    }
  }

  async saveUnlabeledKillmail(killmail) {
    if (!this.initialized) {
      await this.initializeDB();
    }

    const isAtStargate = killmail.pinpoints?.nearestCelestial?.name
      .toLowerCase()
      .includes("stargate");
    const nearestCelestial = isAtStargate
      ? killmail.pinpoints.nearestCelestial.name
      : null;
    try {
      await this.db.run(
        `INSERT OR IGNORE INTO unlabeled_killmails (
            killmail_id, solar_system_id, killmail_time, is_at_stargate, nearest_celestial, ship_type_id, zkill_data
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          killmail.killID,
          killmail.killmail.solar_system_id,
          killmail.killmail.killmail_time,
          isAtStargate,
          nearestCelestial,
          killmail.killmail.victim.ship_type_id,
          JSON.stringify(killmail),
        ]
      );
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT") {
        console.error(
          "Failed to save killmail due to constraint error:",
          error
        );
      } else {
        console.error("Error saving unlabeled killmail:", error);
      }
      throw error;
    }
  }

  async getUnlabeledKillmails() {
    if (!this.initialized) {
      await this.initializeDB();
    }

    try {
      // Only select killmails that are identified as at stargates and order by added_at
      return await this.db.all(
        `SELECT * FROM unlabeled_killmails WHERE is_at_stargate = TRUE ORDER BY added_at ASC`
      );
    } catch (error) {
      console.error("Error getting unlabeled killmails:", error);
      throw error;
    }
  }

  async labelKillmail(killmailId, isCamp) {
    if (!this.initialized) {
      await this.initializeDB();
    }

    try {
      await this.db.exec("BEGIN TRANSACTION");

      const killmail = await this.db.get(
        `SELECT * FROM unlabeled_killmails WHERE killmail_id = ?`,
        [killmailId]
      );

      if (killmail) {
        // Insert into labeled_killmails, including only necessary columns
        await this.db.run(
          `INSERT INTO labeled_killmails (
            killmail_id, solar_system_id, killmail_time, nearest_celestial, ship_type_id, zkill_data, is_camp
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            killmail.killmail_id,
            killmail.solar_system_id,
            killmail.killmail_time,
            killmail.nearest_celestial,
            killmail.ship_type_id,
            killmail.zkill_data,
            isCamp ? 1 : 0,
          ]
        );

        // Delete from unlabeled_killmails
        await this.db.run(
          `DELETE FROM unlabeled_killmails WHERE killmail_id = ?`,
          [killmailId]
        );
      }

      await this.db.exec("COMMIT");
    } catch (error) {
      console.error("Error labeling killmail:", error);
      await this.db.exec("ROLLBACK");
      if (error.code === "SQLITE_CONSTRAINT") {
        console.error(
          "Failed to label killmail due to constraint error:",
          error
        );
      } else {
        console.error("Error labeling killmail:", error);
      }
      throw error;
    }
  }
}

module.exports = { TrainingDB };
