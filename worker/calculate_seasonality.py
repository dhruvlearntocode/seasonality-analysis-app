# FILE: worker/calculate_seasonality.py
# --- Updated to process tickers sequentially for reliability and include Crypto ---

import yfinance as yf
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta
import os
import time

# --- Configuration ---
# Use simple relative paths. The GitHub Action's working directory is the project root.
TICKER_FILE_STOCKS = 'worker/stocks.txt'
TICKER_FILE_ETFS = 'worker/etfs.txt'
TICKER_FILE_INDIA = 'worker/india_stocks.txt'
TICKER_FILE_CRYPTO = 'worker/crypto.txt'
OUTPUT_FILE = 'public/scan_results.json'

# Define the asset classes and their corresponding ticker files and trading days
ASSET_CONFIGS = [
    {'name': 'Stocks', 'file': TICKER_FILE_STOCKS, 'trading_days_in_month': 21},
    {'name': 'ETFs', 'file': TICKER_FILE_ETFS, 'trading_days_in_month': 21},
    {'name': 'India Stocks', 'file': TICKER_FILE_INDIA, 'trading_days_in_month': 21},
    {'name': 'Crypto', 'file': TICKER_FILE_CRYPTO, 'trading_days_in_month': 30}
]

FORWARD_PERIODS_MONTHS = [1, 2, 3]
LOOKBACK_PERIODS_YEARS = sorted([5, 10, 20], reverse=True) 
MAX_LOOKBACK = LOOKBACK_PERIODS_YEARS[0]

# --- Helper Function to Fetch Price Data ---
def fetch_price_history(ticker):
    """
    Fetches historical daily price data for a single ticker for the maximum lookback period.
    """
    print(f"    - Fetching max ({MAX_LOOKBACK} years) data for {ticker}...")
    end_date = datetime.now()
    start_date = end_date - timedelta(days=MAX_LOOKBACK * 365.25)
    
    stock_ticker = yf.Ticker(ticker)
    data = stock_ticker.history(start=start_date, end=end_date, auto_adjust=True)
    
    if data.empty:
        raise ValueError(f"No data returned for ticker {ticker}.")
    
    data.index = data.index.tz_localize(None)
    return data['Close']

# --- Core Logic to Calculate Metrics for a Single Ticker ---
def calculate_metrics_for_ticker(prices, forward_months, today, trading_days_in_month):
    """
    Calculates all performance metrics for a single ticker's price history.
    """
    forward_days = forward_months * trading_days_in_month
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

# --- Main Execution Block (Sequential) ---
def run_scan():
    """
    Orchestrates the entire process sequentially for reliability.
    """
    today = datetime.today()
    print(f"Starting daily seasonality scan for date: {today.strftime('%Y-%m-%d')}")
    
    final_output = {}

    for config in ASSET_CONFIGS:
        asset_name = config['name']
        ticker_file = config['file']
        trading_days_in_month = config['trading_days_in_month']
        print(f"\n========================================")
        print(f"Processing Asset Class: {asset_name}")
        print(f"========================================")

        try:
            with open(ticker_file, 'r') as f:
                tickers = [line.strip().upper() for line in f.readlines() if line.strip()]
        except FileNotFoundError:
            print(f"  - WARNING: Ticker file not found at {ticker_file}. Skipping this asset class.")
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
        
        for ticker in tickers:
            print(f"\n[Processing Ticker: {ticker}]")
            try:
                prices = fetch_price_history(ticker)
                
                for lookback in LOOKBACK_PERIODS_YEARS:
                    lookback_start_date = today - timedelta(days=lookback * 365.25)
                    prices_for_lookback = prices[prices.index >= lookback_start_date]
                    
                    for forward in FORWARD_PERIODS_MONTHS:
                        key = f"{forward}m_{lookback}y"
                        metrics = calculate_metrics_for_ticker(prices_for_lookback, forward, today, trading_days_in_month)
                        
                        if metrics:
                            metrics['ticker'] = ticker
                            asset_results[key].append(metrics)
                
                print(f"  - SUCCESS: Finished all permutations for {ticker}.")
                # Add a small delay to be respectful to the API provider and avoid rate limits.
                time.sleep(0.01) 

            except Exception as e:
                print(f"  --> ERROR processing {ticker}. Reason: {e}")
        
        final_output[asset_name] = asset_results

    output_dir = os.path.dirname(OUTPUT_FILE)
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\nWriting combined results to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(final_output, f, indent=2)
        
    print(f"✅ Scan complete. Results saved successfully.")

if __name__ == "__main__":
    run_scan()
