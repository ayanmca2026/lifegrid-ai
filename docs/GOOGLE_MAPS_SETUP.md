# Google Maps Setup Guide

To run the LIFEGRID AI frontend with Google Maps, you need to provide a valid Google Maps API Key.

## 1. Get an API Key
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Navigate to **APIs & Services** > **Library**.
4. Search for **Maps JavaScript API** and click **Enable**.
5. Go to **APIs & Services** > **Credentials**.
6. Click **Create Credentials** > **API Key**.
7. (Optional but recommended) Click on the newly created key to restrict it:
   - **Application restrictions**: HTTP referrers (web sites) - add your production domain and localhost:3000.
   - **API restrictions**: Select only **Maps JavaScript API**.

## 2. Local Setup
Create a .env file in the rontend directory and add your key:
\\\
VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
\\\

## 3. Production Deployment (Vercel)
When deploying to Vercel, go to your Project Settings > Environment Variables and add:
- Key: \VITE_GOOGLE_MAPS_API_KEY\
- Value: Your API Key

> **Note on Billing**: Google Maps JavaScript API provides \ of monthly free usage, which covers approximately 28,000 map loads per month. This is more than sufficient for the SIH demo.
