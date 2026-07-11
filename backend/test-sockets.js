const io = require("socket.io-client");

async function run() {
  console.log("Initializing test client sockets...");
  const customerSocket = io("http://localhost:3000");
  const otherCustomerSocket = io("http://localhost:3000");
  const mechanicSocket = io("http://localhost:3000");

  let otherCustomerReceivedLeak = false;

  customerSocket.on("connect", () => {
    console.log("[Test] Customer 1 connected:", customerSocket.id);
    customerSocket.emit("register_user", { name: "Alice Customer", role: "customer", email: "alice@resq.com" });
    customerSocket.emit("update_location", { lat: 12.34, lng: 56.78 });
  });

  otherCustomerSocket.on("connect", () => {
    console.log("[Test] Unrelated Customer 2 connected:", otherCustomerSocket.id);
    otherCustomerSocket.emit("register_user", { name: "Eve Spy", role: "customer", email: "eve@resq.com" });
    otherCustomerSocket.emit("update_location", { lat: 12.35, lng: 56.79 });
  });

  mechanicSocket.on("connect", () => {
    console.log("[Test] Mechanic connected:", mechanicSocket.id);
    mechanicSocket.emit("register_user", { name: "Bob Mechanic", role: "mechanic", email: "bob@resq.com" });
    mechanicSocket.emit("update_location", { lat: 12.345, lng: 56.785 });
    
    // Toggle mechanic availability online (should join mechanics_room)
    setTimeout(() => {
      console.log("[Test] Mechanic going online...");
      mechanicSocket.emit("toggle_mechanic_status", { isOnline: true });
    }, 500);
  });

  // Track customer events
  customerSocket.on("mechanics_list_updated", (mechs) => {
    console.log("[Test] Alice Customer received mechanics list update:", mechs.length, "online");
  });

  customerSocket.on("request_created", (req) => {
    console.log("[Test] Alice Customer request created successfully:", req.id);
  });

  customerSocket.on("mechanic_assigned", (data) => {
    console.log("[Test] Alice Customer matched with mechanic:", data.mechanicName);
  });

  // Catch any leaked messages on other customer's socket
  otherCustomerSocket.on("new_breakdown_request", () => {
    otherCustomerReceivedLeak = true;
    console.error("❌ LEAK DETECTED: Unrelated Customer 2 received new_breakdown_request!");
  });
  otherCustomerSocket.on("mechanic_assigned", () => {
    otherCustomerReceivedLeak = true;
    console.error("❌ LEAK DETECTED: Unrelated Customer 2 received mechanic_assigned!");
  });

  // Mechanic listeners
  mechanicSocket.on("new_breakdown_request", (job) => {
    console.log("[Test] Mechanic received breakdown request:", job.id, "from", job.customerName);
    
    // Accept the job
    setTimeout(() => {
      console.log("[Test] Mechanic accepting job...");
      mechanicSocket.emit("accept_job", { requestId: job.id });
    }, 500);
  });

  mechanicSocket.on("job_assigned", (job) => {
    console.log("[Test] Mechanic confirmed job assigned successfully:", job.id);
  });

  // Customer triggers breakdown broadcast
  setTimeout(() => {
    console.log("[Test] Alice Customer broadcasting request...");
    customerSocket.emit("request_help", {
      vehicleType: "Car",
      description: "Flat Tire on Main St.",
      location: { lat: 12.34, lng: 56.78 }
    });
  }, 1200);

  // Complete and disconnect
  setTimeout(() => {
    console.log("==========================================");
    console.log("[Test] Verification results:");
    if (otherCustomerReceivedLeak) {
      console.log("❌ FAILED: Data leakage occurred to unrelated customers.");
    } else {
      console.log("✅ PASSED: Rooms are fully segregated. No data leakage detected.");
    }
    console.log("==========================================");

    customerSocket.disconnect();
    otherCustomerSocket.disconnect();
    mechanicSocket.disconnect();
    process.exit(otherCustomerReceivedLeak ? 1 : 0);
  }, 2500);
}

run();
