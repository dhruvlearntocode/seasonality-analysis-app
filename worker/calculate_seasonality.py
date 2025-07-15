# FILE: worker/calculate_seasonality.py
# --- Optimized to reduce API calls by fetching once and slicing data ---

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
# Ensure the lookback periods are sorted from longest to shortest
LOOKBACK_PERIODS_YEARS = sorted([5, 10, 20], reverse=True) 
MAX_LOOKBACK = LOOKBACK_PERIODS_YEARS[0] # The longest period, e.g., 20

# --- Helper Function to Fetch Price Data ---
def fetch_max_price_history(ticker):
    """
    Fetches historical daily price data for a given ticker for the maximum lookback period.
    """
    print(f"    - Fetching max ({MAX_LOOKBACK} years) data for {ticker}...")
    end_date = datetime.now()
    start_date = end_date - timedelta(days=MAX_LOOKBACK * 365.25)
    
    data = yf.download(ticker, start=start_date, end=end_date, progress=False, auto_adjust=True)
    
    if data.empty:
        raise ValueError(f"No data returned for ticker {ticker}.")
    
    return data['Close']

# --- Core Logic to Calculate Metrics for a Single Ticker ---
def calculate_metrics_for_ticker(prices, forward_months):
    """
    Calculates all performance metrics for a single ticker's price history for a given forward period.
    """
    today = datetime.now()
    forward_days = forward_months * 21
    all_returns = []
    
    if prices.empty:
        return None

    # Determine the actual start year from the provided price data slice
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
    Orchestrates the entire process with optimized API calls.
    """
    print("Starting daily seasonality scan...")
    with open(TICKER_FILE, 'r') as f:
        tickers = [line.strip() for line in f.readlines() if line.strip()]
    
    # Initialize the results dictionary structure
    all_results = {}
    for lookback in LOOKBACK_PERIODS_YEARS:
        for forward in FORWARD_PERIODS_MONTHS:
            key = f"{forward}m_{lookback}y"
            all_results[key] = []

    # Main loop is now by ticker, not by permutation
    for ticker in tickers:
        print(f"\n[Processing Ticker: {ticker}]")
        try:
            # Step 1: Fetch data ONCE for the max lookback period
            max_prices = fetch_max_price_history(ticker)
            
            # Step 2: Loop through the lookback periods and slice the data
            for lookback in LOOKBACK_PERIODS_YEARS:
                print(f"  - Analyzing for {lookback}-year lookback period...")
                
                # Slice the dataframe to get the last N years of data.
                # This handles cases where a stock has less than the max history.
                lookback_start_date = datetime.now() - timedelta(days=lookback * 365.25)
                prices_for_lookback = max_prices[max_prices.index >= lookback_start_date]
                
                # Step 3: Loop through the forward periods and calculate metrics
                for forward in FORWARD_PERIODS_MONTHS:
                    key = f"{forward}m_{lookback}y"
                    metrics = calculate_metrics_for_ticker(prices_for_lookback, forward)
                    
                    if metrics:
                        metrics['ticker'] = ticker
                        all_results[key].append(metrics)
                        
        except Exception as e:
            print(f"  --> ERROR: Could not process {ticker}. Reason: {e}")

    output_dir = os.path.dirname(OUTPUT_FILE)
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\nWriting results to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(all_results, f, indent=2)
        
    print(f"✅ Scan complete. Results saved successfully.")

if __name__ == "__main__":
    run_scan()
