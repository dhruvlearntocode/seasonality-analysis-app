# FILE: worker/calculate_seasonality.py
# --- Optimized for a single, batch API call for all tickers ---

# Step 1: Import necessary libraries
import yfinance as yf
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta
import os

# Step 2: Build robust file paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
TICKER_FILE = os.path.join(PROJECT_ROOT, 'worker', 'tickers.txt')
OUTPUT_FILE = os.path.join(PROJECT_ROOT, 'public', 'scan_results.json')

# --- Configuration Variables ---
FORWARD_PERIODS_MONTHS = [1, 2, 3]
LOOKBACK_PERIODS_YEARS = sorted([5, 10, 20], reverse=True) 
MAX_LOOKBACK = LOOKBACK_PERIODS_YEARS[0]

# --- Helper Function to Fetch Price Data ---
def fetch_all_price_history(tickers):
    """
    Fetches historical daily price data for a list of tickers in a single batch API call.
    """
    print(f"    - Fetching max ({MAX_LOOKBACK} years) data for {len(tickers)} tickers in a single batch...")
    end_date = datetime.now()
    start_date = end_date - timedelta(days=MAX_LOOKBACK * 365.25)
    
    # Pass a space-separated string of tickers to yf.download
    data = yf.download(' '.join(tickers), start=start_date, end=end_date, progress=False, auto_adjust=True)
    
    if data.empty:
        raise ValueError("No data returned from yfinance for the given tickers.")
    
    # The result is a DataFrame with multi-level columns. We only need the 'Close' prices.
    return data['Close']

# --- Core Logic to Calculate Metrics for a Single Ticker ---
def calculate_metrics_for_ticker(prices, forward_months, today):
    """
    Calculates all performance metrics for a single ticker's price history.
    'prices' is now a pandas Series for a single ticker.
    """
    forward_days = forward_months * 21
    all_returns = []
    
    if prices.empty or prices.isnull().all():
        return None

    # Remove any leading/trailing NaN values that can occur for newer stocks in a long lookback
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

# --- Main Execution Block (Optimized) ---
def run_scan():
    """
    Orchestrates the entire process with a single batch API call.
    """
    today = datetime.today()
    print(f"Starting daily seasonality scan for date: {today.strftime('%Y-%m-%d')}")

    with open(TICKER_FILE, 'r') as f:
        tickers = [line.strip().upper() for line in f.readlines() if line.strip()]
    
    all_results = {}
    for lookback in LOOKBACK_PERIODS_YEARS:
        for forward in FORWARD_PERIODS_MONTHS:
            key = f"{forward}m_{lookback}y"
            all_results[key] = []

    try:
        # Step 1: Fetch all data in one go
        all_prices = fetch_all_price_history(tickers)
        
        # Step 2: Loop through each ticker from the downloaded data
        for ticker in tickers:
            print(f"\n[Processing Ticker: {ticker}]")
            
            # Check if the ticker's data was successfully downloaded (it might be a column of NaNs if invalid)
            if ticker not in all_prices.columns or all_prices[ticker].isnull().all():
                print(f"  - WARNING: No valid data for {ticker} in the downloaded batch. Skipping.")
                continue

            # Get the price series for the current ticker
            ticker_prices = all_prices[ticker].dropna()
            
            # Step 3: Loop through the lookback periods and slice the in-memory data
            for lookback in LOOKBACK_PERIODS_YEARS:
                lookback_start_date = today - timedelta(days=lookback * 365.25)
                prices_for_lookback = ticker_prices[ticker_prices.index >= lookback_start_date]
                
                # Step 4: Loop through forward periods and calculate metrics
                for forward in FORWARD_PERIODS_MONTHS:
                    key = f"{forward}m_{lookback}y"
                    metrics = calculate_metrics_for_ticker(prices_for_lookback, forward, today)
                    
                    if metrics:
                        metrics['ticker'] = ticker
                        all_results[key].append(metrics)
            print(f"  - SUCCESS: Finished all permutations for {ticker}.")

    except Exception as e:
        print(f"--> FATAL ERROR during data fetch or processing: {e}")

    output_dir = os.path.dirname(OUTPUT_FILE)
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\nWriting results to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(all_results, f, indent=2)
        
    print(f"✅ Scan complete. Results saved successfully.")

if __name__ == "__main__":
    run_scan()
