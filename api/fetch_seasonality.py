# FILE: api/fetch_seasonality.py

from http.server import BaseHTTPRequestHandler
import json
import yfinance as yf
from datetime import datetime
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):

    def do_GET(self):
        # Parse query parameters from the request URL
        query_components = parse_qs(urlparse(self.path).query)
        ticker = query_components.get('ticker', [None])[0]
        start_year = query_components.get('startYear', [None])[0]

        if not ticker or not start_year:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Missing ticker or startYear parameter'}).encode())
            return

        try:
            start_date = datetime(int(start_year), 1, 1)
            end_date = datetime.now()

            # Fetch data using yfinance
            data = yf.download(ticker, start=start_date, end=end_date, progress=False, auto_adjust=True)

            if data.empty:
                self.send_response(404)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'No data found for ticker {ticker}'}).encode())
                return

            # Convert the DataFrame to a JSON-serializable format
            data.index = data.index.strftime('%Y-%m-%d')
            response_data = data.to_dict(orient='index')

            # Send a successful response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*') # Allow requests from any origin
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

        return
