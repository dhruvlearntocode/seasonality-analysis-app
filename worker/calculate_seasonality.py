# FILE: worker/calculate_seasonality.py
# --- FIX: Corrected date/timezone handling to resolve empty JSON issue ---

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
def fetch_max_price_history(ticker):
    """
    Fetches historical daily price data using the recommended yf.Ticker object.
    This method correctly handles dividend and split adjustments.
    """
    print(f"    - Fetching max ({MAX_LOOKBACK} years) data for {ticker}...")
    end_date = datetime.now()
    start_date = end_date - timedelta(days=MAX_LOOKBACK * 365.25)
    
    stock_ticker = yf.Ticker(ticker)
    data = stock_ticker.history(start=start_date, end=end_date, auto_adjust=True)
    
    if data.empty:
        raise ValueError(f"No data returned for ticker {ticker}.")
    
    # --- FIX: Remove timezone information to prevent comparison errors ---
    # This makes the index "timezone-naive", matching the naive datetime objects we create later.
    data.index = data.index.tz_localize(None)
    
    return data['Close']

# --- Core Logic to Calculate Metrics for a Single Ticker ---
def calculate_metrics_for_ticker(prices, forward_months, today):
    """
    Calculates all performance metrics for a single ticker's price history.
    'today' is passed in to ensure the date is consistent throughout the entire scan.
    """
    forward_days = forward_months * 21
    all_returns = []
    
    if prices.empty:
        return None

    start_year_of_data = prices.index.year.min()

    for year in range(start_year_of_data, today.year):
        # Create a timezone-naive datetime object for the target date in a past year.
        start_date_past = datetime(year, today.month, today.day)
        
        try:
            # searchsorted works reliably with two naive datetime objects.
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
    Orchestrates the entire process with optimized API calls and correct date handling.
    """
    # --- FIX: Define 'today' once at the start for consistency ---
    today = datetime.today()
    print(f"Starting daily seasonality scan for date: {today.strftime('%Y-%m-%d')}")

    with open(TICKER_FILE, 'r') as f:
        tickers = [line.strip() for line in f.readlines() if line.strip()]
    
    all_results = {}
    for lookback in LOOKBACK_PERIODS_YEARS:
        for forward in FORWARD_PERIODS_MONTHS:
            key = f"{forward}m_{lookback}y"
            all_results[key] = []

    for ticker in tickers:
        print(f"\n[Processing Ticker: {ticker}]")
        try:
            max_prices = fetch_max_price_history(ticker)
            
            for lookback in LOOKBACK_PERIODS_YEARS:
                print(f"  - Analyzing for {lookback}-year lookback period...")
                
                lookback_start_date = today - timedelta(days=lookback * 365.25)
                prices_for_lookback = max_prices[max_prices.index >= lookback_start_date]
                
                for forward in FORWARD_PERIODS_MONTHS:
                    key = f"{forward}m_{lookback}y"
                    # Pass 'today' into the function
                    metrics = calculate_metrics_for_ticker(prices_for_lookback, forward, today)
                    
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
