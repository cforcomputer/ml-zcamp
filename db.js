const { app } = require("electron");
const sqlite3 = require("sqlite3");
const path = require("path");
const { promisify } = require("util");

class TrainingDB {
  constructor() {
    this.db = null; // Initialize db to null initially
    this.initialized = false; // Flag to track initialization
    this.initializeDB(); // Removed await here
  }

  async initializeDB() {
    try {
      if (this.initialized) return;

      // Wait for the app to be ready before using app.getPath
      await app.whenReady();

      const dbPath = path.join(app.getPath("userData"), "training.db");
      console.log("Database path:", dbPath);

      this.db = new sqlite3.Database(dbPath);
      this.db.run = promisify(this.db.run.bind(this.db));
      this.db.exec = promisify(this.db.exec.bind(this.db));
      this.db.get = promisify(this.db.get.bind(this.db));

      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS camp_labels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          camp_id TEXT NOT NULL,
          system_id INTEGER NOT NULL,
          stargate_name TEXT NOT NULL,
          is_real_camp BOOLEAN NOT NULL,
          first_kill_time DATETIME NOT NULL,
          last_kill_time DATETIME NOT NULL,
          num_kills INTEGER NOT NULL,
          num_unique_attackers INTEGER NOT NULL,
          avg_kill_value REAL,
          kill_frequency REAL,
          labeled_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS camp_killmails (
          camp_label_id INTEGER,
          killmail_id INTEGER NOT NULL,
          kill_time DATETIME NOT NULL,
          victim_ship_type INTEGER NOT NULL,
          num_attackers INTEGER NOT NULL,
          is_pod BOOLEAN NOT NULL,
          FOREIGN KEY(camp_label_id) REFERENCES camp_labels(id)
        );
      `);
      console.log("Training database initialized");
      this.initialized = true;
    } catch (error) {
      console.error("Database initialization error:", error);
      throw error;
    }
  }

  async saveCampLabel(camp, isRealCamp) {
    try {
      if (!this.initialized) {
        console.error("Database not initialized");
        throw new Error("Database not initialized");
      }

      const killFrequency =
        camp.kills.length /
        ((new Date(camp.lastKill) - new Date(camp.firstKill)) / (1000 * 60));

      const uniqueAttackers = new Set(
        camp.kills.flatMap((k) =>
          k.killmail.attackers.map((a) => a.character_id)
        )
      ).size;

      const avgValue =
        camp.kills.reduce((sum, k) => sum + k.zkb.totalValue, 0) /
        camp.kills.length;

      // Use a transaction to ensure data integrity
      await this.db.exec("BEGIN TRANSACTION");

      const insertLabelResult = await this.db.run(
        `
        INSERT INTO camp_labels (
          camp_id, system_id, stargate_name, is_real_camp,
          first_kill_time, last_kill_time, num_kills,
          num_unique_attackers, avg_kill_value, kill_frequency
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          camp.id,
          camp.systemId,
          camp.stargateName,
          isRealCamp ? 1 : 0,
          camp.firstKill,
          camp.lastKill,
          camp.kills.length,
          uniqueAttackers,
          avgValue,
          killFrequency,
        ]
      );

      const campLabelId = insertLabelResult.lastID;

      for (const kill of camp.kills) {
        await this.db.run(
          `
          INSERT INTO camp_killmails (
            camp_label_id, killmail_id, kill_time,
            victim_ship_type, num_attackers, is_pod
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
          [
            campLabelId,
            kill.killID,
            kill.killmail.killmail_time,
            kill.killmail.victim.ship_type_id,
            kill.killmail.attackers.length,
            kill.killmail.victim.ship_type_id === 670, // Pod ID
          ]
        );
      }

      await this.db.exec("COMMIT");

      return campLabelId;
    } catch (error) {
      console.error("Error saving camp data:", error);
      // Rollback the transaction if an error occurred
      await this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

module.exports = { TrainingDB };
