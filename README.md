# RoadResQ - On-Demand Roadside Assistance Web Platform

RoadResQ is a real-time web application prototype designed to connect stranded drivers (Customers) with nearby roadside assistance responders (Mechanics). It includes real-time location tracking using Google Maps, a secure Socket.io communication channel, OTP-based login, and an AI-powered emergency chatbot (Gemini).

---

## 🛠️ Prerequisites

Before running the application, make sure you have the following installed on your system:
- **Node.js** (v16.0.0 or higher recommended)
- **NPM** (normally packaged with Node.js)

---

## 🚀 Installation & Local Setup

1. **Clone or Download the Repository:**
   ```bash
   git clone https://github.com/rohancoder19/RoadResQ.git
   cd RoadResQ
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   - Copy the `.env.example` template to create your `.env` file:
     ```bash
     cp .env.example .env
     ```
   - Open `.env` and fill in your API keys:
     ```env
     GEMINI_API_KEY=your_gemini_api_key_here
     GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
     ```
     *(Note: If the `GOOGLE_MAPS_API_KEY` is left blank, the map will load in development watermark mode).*

4. **Start the Server:**
   ```bash
   npm start
   ```
   Or run using dev mode:
   ```bash
   npm run dev
   ```

5. **Access the App:**
   - Open your browser and navigate to: **`http://localhost:3000`**

---

## 📖 Operational Procedures & User Roles

The platform supports two distinct user roles. Here is the workflow for each:

### 1. Customer Workflow (Stranded Driver)
* **Registration/Login:**
  - Click **Sign Up** to create an account as a **Customer**.
  - Enter your Name, Email, Phone Number, and Password.
  - On the Login tab, enter your credentials.
  - A 6-digit passcode (OTP) will be generated. 
    - *If SMTP credentials are not configured in your `.env`*, the code is automatically printed to the terminal console and will appear in a mock preview popup for ease of testing.
    - Enter the OTP to access the dashboard.
* **Requesting Assistance:**
  - Share your location (browser GPS prompts).
  - Select your **Vehicle Type** (Car, Bike, Truck, SUV) and write a description of the problem (e.g., "Flat tire on highway").
  - Click **Request Help**. Your request will be broadcasted to all online mechanics in a 50km radius.
* **During Dispatch:**
  - Once a responder accepts, you will see their details (name, contact phone, vehicle status) and watch their location update in real-time on your map.
  - Use the **Rescue chatbot** (Gemini-powered) at any time to ask for safety recommendations or tips.
  - Use the **SOS Share** button to quickly copy/share your live coordinates.

### 2. Responder/Mechanic Workflow (Roadside Operator)
* **Registration/Login:**
  - Register as a **Responder** (select the "Responder" role badge during registration) and log in using the same OTP verification process.
* **Going Online:**
  - Once logged in, toggle your status to **Go Online** (Online / Offline switch).
  - Your marker will appear on the maps of all active Customers in your region.
* **Handling Jobs:**
  - When a Customer requests help nearby, an incoming emergency alert card will slide in containing the vehicle type, customer description, distance, and contact button.
  - Click **Accept Job** to claim the dispatch.
  - You will be guided with real-time navigation routes to the customer's coordinates.
  - When completed, click **Complete Rescue** to return to the available responders pool.

---

## 🧪 Running Integration Tests

To verify socket communication and Haversine distance-based matching without opening a browser, you can run the built-in test scripts:

1. **Start the server:**
   ```bash
   node server.js
   ```
2. **Open another terminal and run the test files:**
   - To test private room isolation and data leakage prevention:
     ```bash
     node test-sockets.js
     ```
   - To test distance-based mechanic filtering:
     ```bash
     node test-nearby.js
     ```
