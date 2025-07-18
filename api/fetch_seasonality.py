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
        ticker = query.get("ticker", [None])[0]
        start_year = query.get("startYear", [None])[0]

        if not ticker or not start_year:
            return self._send_response(400, {"error": "Missing required query parameters: ticker and startYear"})

        try:
            start = datetime(int(start_year), 1, 1)
            end = datetime.now()

            df = yf.download(ticker, start=start, end=end, auto_adjust=True, progress=False)

            if df.empty:
                return self._send_response(404, {"error": f'No data found for "{ticker}" from {start_year}'})

            df.index = df.index.strftime('%Y-%m-%d')
            return self._send_response(200, df.to_dict(orient='index'))

        except Exception as e:
            return self._send_response(500, {"error": str(e)})

    def _send_response(self, status_code, payload):
        self.send_response(status_code)
        self.send_header("Content-type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())
