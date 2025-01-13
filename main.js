// main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const io = require("socket.io-client");
const { TrainingDB } = require("./db");

let mainWindow;
let socket;
const trainingDB = new TrainingDB();

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: require("path").join(__dirname, "preload.js"),
    },
  });

  await mainWindow.loadFile("index.html"); // Connect to the production server

  socket = io("https://where.zcamp.lol", {
    transports: ["websocket"],
    path: "/socket.io/",
    reconnectionAttempts: 5,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    withCredentials: false,
  });

  socket.on("connect", () => {
    console.log("Connected to zcamp");
  });

  socket.on("connect_error", (error) => {
    console.error("Connection error:", error);
  });

  socket.on("disconnect", (reason) => {
    console.log("Disconnected from server:", reason);
  });

  socket.on("newKillmail", (killmail) => {
    console.log("Received killmail:", killmail.killID);
    mainWindow.webContents.send("newKillmail", killmail);
  });
  socket.on("initialRoams", (data) => {
    console.log("Received initial roam data");
    mainWindow.webContents.send("initialData", data);
  });
}

// IPC Handlers
ipcMain.handle("saveCampLabel", async (_, camp, isRealCamp) => {
  try {
    return await trainingDB.saveCampLabel(camp, isRealCamp);
  } catch (error) {
    console.error("Error saving camp label:", error);
    throw error;
  }
});

app.whenReady().then(async () => {
  await trainingDB.initializeDB(); // Now initialize the database when app is ready
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
