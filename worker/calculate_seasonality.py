# FILE: worker/calculate_seasonality.py
# --- Updated to use the yfinance library ---

# Step 1: Import necessary libraries
import yfinance as yf
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta

# Step 2: Configuration Variables
TICKER_FILE = 'worker/tickers.txt'
OUTPUT_FILE = 'public/scan_results.json' 
FORWARD_PERIODS_MONTHS = [1, 2, 3]
LOOKBACK_PERIODS_YEARS = [5, 10, 20]

# --- Helper Function to Fetch Price Data (Now using yfinance) ---
def fetch_price_history(ticker, years_of_data):
    """
    Fetches historical daily price data for a given ticker using the yfinance library.
    - ticker: The stock symbol (e.g., 'AAPL').
    - years_of_data: How many years of history to fetch.
    Returns a pandas Series of adjusted closing prices, indexed by date.
    """
    print(f"    - Fetching {years_of_data} years of data for {ticker} using yfinance...")
    end_date = datetime.now()
    start_date = end_date - timedelta(days=years_of_data * 365.25)
    
    # yf.download is the core function from the yfinance library.
    # It's more robust than using requests directly.
    # We set progress=False to keep the logs clean in the GitHub Action.
    data = yf.download(ticker, start=start_date, end=end_date, progress=False)
    
    if data.empty:
        raise ValueError(f"No data returned for ticker {ticker}. It may be delisted or an invalid symbol.")
    
    # We only care about the 'Adj Close' as it accounts for dividends and splits.
    return data['Adj Close']

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
    
    for year in range(prices.index.year.min(), today.year):
        start_date_past = datetime(year, today.month, today.day)
        
        try:
            actual_start_idx = prices.index.searchsorted(start_date_past)
            actual_end_idx = actual_start_idx + forward_days

            if actual_end_idx < len(prices):
                start_price = prices.iloc[actual_start_idx]
                end_price = prices.iloc[actual_end_idx]
                
                if start_price > 0:
                    log_return = np.log(end_price / start_price)
                    all_returns.append(log_return)
        except Exception:
            continue

    if not all_returns:
        return None

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
        'yearsOfData': len(all_returns)
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
    
    all_results = {}

    for lookback in LOOKBACK_PERIODS_YEARS:
        for forward in FORWARD_PERIODS_MONTHS:
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

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(all_results, f, indent=2)
        
    print(f"\n✅ Scan complete. Results saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    run_scan()
