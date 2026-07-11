const { io } = require("socket.io-client");

const SERVER_URL = "http://localhost:3000";

// Test Setup
const customerSocket = io(SERVER_URL);
const mechanicSocket = io(SERVER_URL);

let testCompleted = false;

function finishTest(success, message) {
  if (testCompleted) return;
  testCompleted = true;
  console.log(success ? `✅ TEST PASSED: ${message}` : `❌ TEST FAILED: ${message}`);
  customerSocket.disconnect();
  mechanicSocket.disconnect();
  process.exit(success ? 0 : 1);
}

// 1. Mechanic Connects and Goes Online with Location
mechanicSocket.on("connect", () => {
  console.log("Mechanic connected");
  mechanicSocket.emit("register_user", {
    name: "Test Mechanic",
    role: "mechanic",
    email: "testmech@resq.com"
  });

  mechanicSocket.on("register_success", () => {
    // Set location (e.g., center of city)
    mechanicSocket.emit("update_location", { lat: 40.7128, lng: -74.0060 });
    // Go online
    mechanicSocket.emit("toggle_mechanic_status", { isOnline: true });
  });
});

// 2. Customer Connects and Requests Nearby
customerSocket.on("connect", () => {
  console.log("Customer connected");
  
  // Wait a bit for mechanic to be online
  setTimeout(() => {
    customerSocket.emit("register_user", {
      name: "Test Customer",
      role: "customer",
      email: "testcust@resq.com"
    });

    customerSocket.on("register_success", () => {
      // Set location near mechanic (e.g., 5 km away)
      customerSocket.emit("update_location", { lat: 40.7578, lng: -74.0060 });
    });
  }, 1000);
});

// Customer should receive nearby list
customerSocket.on("nearby_mechanics_list", (mechs) => {
  console.log("Received nearby mechanics list:", mechs.length, "mechanics");
  if (mechs.length > 0) {
    const mech = mechs.find(m => m.name === "Test Mechanic");
    if (mech) {
      console.log("Found our mechanic. Distance:", mech.distance, "km");
      finishTest(true, "Customer successfully received targeted nearby mechanic list based on Haversine distance.");
    }
  }
});

// Timeout
setTimeout(() => {
  if (!testCompleted) {
    finishTest(false, "Timeout waiting for nearby mechanics list.");
  }
}, 3000);
