# FILE: worker/calculate_seasonality.py
# --- Optimized with concurrent processing for large ticker lists ---

import yfinance as yf
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta
import os
import time
import concurrent.futures

# --- Configuration ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
OUTPUT_FILE = os.path.join(PROJECT_ROOT, 'public', 'scan_results.json')

ASSET_CONFIGS = [
    {'name': 'Stocks', 'file': os.path.join(PROJECT_ROOT, 'worker', 'stocks.txt')},
    {'name': 'ETFs', 'file': os.path.join(PROJECT_ROOT, 'worker', 'etfs.txt')},
    {'name': 'India Stocks', 'file': os.path.join(PROJECT_ROOT, 'worker', 'india_stocks.txt')}
]

FORWARD_PERIODS_MONTHS = [1, 2, 3]
LOOKBACK_PERIODS_YEARS = sorted([5, 10, 20], reverse=True) 
MAX_LOOKBACK = LOOKBACK_PERIODS_YEARS[0]
# Set the number of parallel worker threads. 8 is a good starting point for I/O-bound tasks.
MAX_WORKERS = 8

# --- Helper Function to Fetch Price Data ---
def fetch_price_history(ticker):
    """
    Fetches historical daily price data for a single ticker.
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=MAX_LOOKBACK * 365.25)
    
    stock_ticker = yf.Ticker(ticker)
    data = stock_ticker.history(start=start_date, end=end_date, auto_adjust=True)
    
    if data.empty:
        raise ValueError(f"No data returned for ticker {ticker}.")
    
    data.index = data.index.tz_localize(None)
    return data['Close']

# --- Core Logic to Calculate Metrics for a Single Ticker ---
def calculate_metrics_for_ticker(prices, forward_months, today):
    """
    Calculates all performance metrics for a single ticker's price history.
    """
    forward_days = forward_months * 21
    all_returns = []
    
    if prices.empty or prices.isnull().all():
        return None

    prices = prices.dropna()
    if prices.empty:
        return None

    start_year_of_data = prices.index.year.min()

    for year in range(start_year_of_data, today.year):
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

# --- New function to encapsulate the work for a single ticker ---
def process_ticker(ticker, today):
    """
    Fetches data and calculates all permutations of metrics for a single ticker.
    This function is designed to be run in a parallel worker thread.
    """
    print(f"[Thread] Processing Ticker: {ticker}")
    try:
        prices = fetch_price_history(ticker)
        ticker_results = []
        
        for lookback in LOOKBACK_PERIODS_YEARS:
            lookback_start_date = today - timedelta(days=lookback * 365.25)
            prices_for_lookback = prices[prices.index >= lookback_start_date]
            
            for forward in FORWARD_PERIODS_MONTHS:
                key = f"{forward}m_{lookback}y"
                metrics = calculate_metrics_for_ticker(prices_for_lookback, forward, today)
                
                if metrics:
                    metrics['ticker'] = ticker
                    ticker_results.append({'key': key, 'metrics': metrics})
        
        print(f"[Thread] SUCCESS: Finished all permutations for {ticker}.")
        return ticker_results
    except Exception as e:
        print(f"[Thread] --> ERROR processing {ticker}. Reason: {e}")
        return [] # Return an empty list on failure

# --- Main Execution Block (Optimized for Parallelism) ---
def run_scan():
    """
    Orchestrates the entire process using a thread pool for concurrent execution.
    """
    today = datetime.today()
    print(f"Starting daily seasonality scan for date: {today.strftime('%Y-%m-%d')}")
    
    final_output = {}

    for config in ASSET_CONFIGS:
        asset_name = config['name']
        ticker_file = config['file']
        print(f"\n========================================")
        print(f"Processing Asset Class: {asset_name}")
        print(f"========================================")

        try:
            with open(ticker_file, 'r') as f:
                tickers = [line.strip().upper() for line in f.readlines() if line.strip()]
        except FileNotFoundError:
            print(f"  - WARNING: Ticker file not found at {ticker_file}. Skipping.")
            continue

        if not tickers:
            print(f"  - INFO: No tickers found in {ticker_file}. Skipping.")
            final_output[asset_name] = {}
            continue
        
        asset_results = {}
        for lookback in LOOKBACK_PERIODS_YEARS:
            for forward in FORWARD_PERIODS_MONTHS:
                key = f"{forward}m_{lookback}y"
                asset_results[key] = []

        # Use a ThreadPoolExecutor to process tickers in parallel.
        # This is ideal for I/O-bound tasks like making many network requests.
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            # Create a future for each ticker processing task
            future_to_ticker = {executor.submit(process_ticker, ticker, today): ticker for ticker in tickers}
            
            for future in concurrent.futures.as_completed(future_to_ticker):
                ticker_name = future_to_ticker[future]
                try:
                    # Get the results from the completed thread
                    results_from_thread = future.result()
                    # Organize the results into the main dictionary
                    for result in results_from_thread:
                        asset_results[result['key']].append(result['metrics'])
                except Exception as exc:
                    print(f"  --> EXCEPTION for {ticker_name}: {exc}")

        final_output[asset_name] = asset_results

    output_dir = os.path.dirname(OUTPUT_FILE)
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\nWriting combined results to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(final_output, f, indent=2)
        
    print(f"✅ Scan complete. Results saved successfully.")

if __name__ == "__main__":
    run_scan()
