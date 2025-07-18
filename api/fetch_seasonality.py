# FILE: api/fetch_seasonality.py

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime
import yfinance as yf
import json

yf.set_tz_cache_location("/tmp/yfinance_cache")

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        ticker = query.get('ticker', [None])[0]
        start_year = query.get('startYear', [None])[0]

        if not ticker or not start_year:
            self._respond(400, {'error': 'Missing required query parameters: ticker and startYear'})
            return

        try:
            start_date = datetime(int(start_year), 1, 1)
            end_date = datetime.now()

            stock = yf.Ticker(ticker)
            data = stock.history(start=start_date, end=end_date, auto_adjust=True)

            if data.empty:
                self._respond(404, {'error': f'No data found for ticker "{ticker}" from {start_year}. It may be an invalid symbol.'})
                return

            data.index = data.index.strftime('%Y-%m-%d')
            response_data = data.to_dict(orient='index')

            self._respond(200, response_data)

        except Exception as e:
            self._respond(500, {'error': str(e)})

    def _respond(self, status_code, payload):
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())
