# Step 1: Import necessary libraries
# requests: To make HTTP requests to the Yahoo Finance API.
# pandas: A powerful library for data manipulation and analysis. We'll use it to easily handle the CSV data from Yahoo.
# numpy: For numerical operations, specifically for calculating log returns, mean, and standard deviation.
# json: To create and write the final JSON output file.
# datetime, timedelta: To handle date calculations for fetching historical data.
import requests
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta

# Step 2: Configuration Variables
# These constants make the script easy to modify without digging into the code.
TICKER_FILE = 'worker/tickers.txt'
# The output file is placed in the React app's `public` folder. This makes it directly accessible
# for the frontend to fetch, just like an image or a CSS file.
OUTPUT_FILE = 'public/scan_results.json' 
FORWARD_PERIODS_MONTHS = [1, 2, 3]
LOOKBACK_PERIODS_YEARS = [5, 10, 20]

# --- Helper Function to Fetch Price Data ---
def fetch_price_history(ticker, years_of_data):
    """
    Fetches historical daily price data for a given ticker from Yahoo Finance.
    - ticker: The stock symbol (e.g., 'AAPL').
    - years_of_data: How many years of history to fetch.
    Returns a pandas Series of adjusted closing prices, indexed by date.
    """
    print(f"    - Fetching {years_of_data} years of data for {ticker}...")
    end_date = datetime.now()
    start_date = end_date - timedelta(days=years_of_data * 365.25)

    start_timestamp = int(start_date.timestamp())
    end_timestamp = int(end_date.timestamp())

    # Yahoo Finance's download URL. It's an unofficial but stable endpoint.
    url = f"https://query1.finance.yahoo.com/v7/finance/download/{ticker}?period1={start_timestamp}&period2={end_timestamp}&interval=1d&events=history"

    # Setting a User-Agent header is crucial. It makes our script look like a regular web browser,
    # which prevents Yahoo from blocking the request.
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}

    response = requests.get(url, headers=headers)
    response.raise_for_status() # This will throw an error if the download fails (e.g., 404 for a bad ticker).

    # The `io.StringIO` wrapper lets pandas read the text content of the response as if it were a file on disk.
    from io import StringIO
    df = pd.read_csv(StringIO(response.text))
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.set_index('Date')

    # We only care about the 'Adj Close' as it accounts for dividends and splits.
    return df['Adj Close']

# --- Core Logic to Calculate Metrics for a Single Ticker ---
def calculate_metrics_for_ticker(prices, forward_months):
    """
    Calculates all performance metrics for a single ticker's price history for a given forward period.
    - prices: A pandas Series of historical prices.
    - forward_months: The number of months in the future to calculate returns for (1, 2, or 3).
    Returns a dictionary of calculated metrics, or None if not enough data exists.
    """
    today = datetime.now()
    forward_days = forward_months * 21 # Approximates trading days in a month.

    all_returns = []

    # We look at each year in our historical data, but we stop before the current year
    # because we can't calculate a *future* return for the current year.
    for year in range(prices.index.year.min(), today.year):
        start_date_past = datetime(year, today.month, today.day)

        try:
            # pandas.searchsorted is a highly efficient way to find the index for our target date.
            # It finds the first valid trading day that is ON or AFTER our target start date.
            actual_start_idx = prices.index.searchsorted(start_date_past)
            actual_end_idx = actual_start_idx + forward_days

            # Ensure we don't try to access an index that is out of bounds.
            if actual_end_idx < len(prices):
                start_price = prices.iloc[actual_start_idx]
                end_price = prices.iloc[actual_end_idx]

                if start_price > 0:
                    # We use the natural logarithm (log return) for calculations. This is standard practice in
                    # quantitative finance as it makes returns time-additive and symmetric.
                    log_return = np.log(end_price / start_price)
                    all_returns.append(log_return)
        except Exception:
            # If there's any issue finding the date (e.g., for stocks that didn't exist yet), we just skip that year.
            continue

    if not all_returns:
        return None # Not enough historical data to form a conclusion.

    # Convert log returns back to simple percentage returns for user-friendly display.
    percent_returns = [(np.exp(lr) - 1) * 100 for lr in all_returns]

    win_rate = (len([r for r in percent_returns if r > 0]) / len(percent_returns)) * 100
    avg_return = np.mean(percent_returns)
    max_profit = np.max(percent_returns)
    max_loss = np.min(percent_returns)

    return {
        'winRate': win_rate,
        'avgReturn': avg_return,
        'maxProfit': max_profit,
        'maxLoss': max_loss,
        'yearsOfData': len(all_returns) # Useful to know how many data points were used.
    }

# --- Main Execution Block ---
def run_scan():
    """
    Orchestrates the entire process: reads tickers, loops through all permutations,
    fetches data, calculates metrics, and saves the final JSON file.
    """
    print("Starting daily seasonality scan...")
    with open(TICKER_FILE, 'r') as f:
        tickers = [line.strip() for line in f.readlines() if line.strip()]

    # This dictionary will hold all our results, structured for easy access by the frontend.
    # e.g., all_results['2m_10y'] will be a list of results for the 2-month forward, 10-year lookback permutation.
    all_results = {}

    for lookback in LOOKBACK_PERIODS_YEARS:
        for forward in FORWARD_PERIODS_MONTHS:
            # Create a unique key for this combination of parameters.
            key = f"{forward}m_{lookback}y"
            all_results[key] = []
            print(f"\n[Processing Permutation: {forward} Month Forward / {lookback} Year Lookback]")

            for ticker in tickers:
                try:
                    prices = fetch_price_history(ticker, lookback)
                    metrics = calculate_metrics_for_ticker(prices, forward)

                    if metrics:
                        metrics['ticker'] = ticker
                        all_results[key].append(metrics)
                        print(f"    - SUCCESS: Calculated metrics for {ticker}.")

                except Exception as e:
                    print(f"    - ERROR: Could not process {ticker}. Reason: {e}")

    # Write the final dictionary to the JSON file with indentation for readability.
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(all_results, f, indent=2)

    print(f"\n✅ Scan complete. Results saved to {OUTPUT_FILE}")

# This ensures the run_scan() function is called only when the script is executed directly.
if __name__ == "__main__":
    run_scan()
