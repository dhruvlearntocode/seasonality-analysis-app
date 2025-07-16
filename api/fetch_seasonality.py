# FILE: api/fetch_seasonality.py
# This is a Vercel Serverless Function that acts as a reliable API endpoint.

from http.server import BaseHTTPRequestHandler
import json
import yfinance as yf
from datetime import datetime
from urllib.parse import urlparse, parse_qs

# --- FIX: Set the yfinance cache location to the writable /tmp directory ---
# This is the standard workaround for read-only serverless environments like Vercel.
yf.set_tz_cache_location("/tmp/yfinance_cache")

class handler(BaseHTTPRequestHandler):
    """
    Handles incoming GET requests to /api/fetch_seasonality.
    It expects 'ticker' and 'startYear' as query parameters.
    """
    def do_GET(self):
        # --- 1. Parse Request ---
        # Extract query parameters from the request URL (e.g., ?ticker=SPY&startYear=2005)
        query_components = parse_qs(urlparse(self.path).query)
        ticker = query_components.get('ticker', [None])[0]
        start_year = query_components.get('startYear', [None])[0]

        # --- 2. Validate Input ---
        if not ticker or not start_year:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Missing required query parameters: ticker and startYear'}).encode())
            return

        try:
            # --- 3. Fetch Data from Yahoo Finance ---
            # The request to Yahoo Finance originates from the Vercel server, not the user's browser.
            start_date = datetime(int(start_year), 1, 1)
            end_date = datetime.now()

            stock_ticker = yf.Ticker(ticker)
            data = stock_ticker.history(start=start_date, end=end_date, auto_adjust=True)

            if data.empty:
                self.send_response(404)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'No data found for ticker "{ticker}" from {start_year}. It may be an invalid symbol.'}).encode())
                return
            
            # --- 4. Format and Send Response ---
            # Convert the DataFrame to a JSON-serializable format that the React app can easily use.
            # The date index is converted to a simple 'YYYY-MM-DD' string.
            data.index = data.index.strftime('%Y-%m-%d')
            response_data = data.to_dict(orient='index')

            # Send a successful (200 OK) response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*') # Allow requests from any origin
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())

        except Exception as e:
            # Catch any other unexpected errors during the process
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

        return
