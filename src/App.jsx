import { Analytics } from '@vercel/analytics/react';
import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, BarChart, Bar, Cell, ReferenceLine, ReferenceArea } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, BarChart2, TrendingUp, TrendingDown, Percent, AlertCircle, Telescope, CheckCircle, Sparkles, Bot, Calendar, XCircle } from 'lucide-react';

// --- Helper Functions ---

/**
 * Calculates daily seasonality.
 * The "Average Return" is now calculated using the average of daily log returns, compounded over the year.
 * Individual year lines remain as simple cumulative returns for visual comparison.
 */
const calculateTradingDaySeasonality = (dailyData, startYear, endYear) => {
  if (!dailyData || Object.keys(dailyData).length === 0) return null;
  const TRADING_DAYS = 251;

  const dataByYear = {};
  for (const dateStr in dailyData) {
    const year = parseInt(dateStr.substring(0, 4), 10);
    if (year >= startYear && year <= endYear) {
      if (!dataByYear[year]) dataByYear[year] = [];
      dataByYear[year].push({ date: new Date(dateStr), price: dailyData[dateStr]['4. close'] });
    }
  }

  for (const year in dataByYear) {
    dataByYear[year].sort((a, b) => a.date - b.date);
  }

  const yearKeys = Object.keys(dataByYear).sort();

  // Part 1: Calculate Individual Year Cumulative Paths (Simple Returns)
  const simpleReturnsByYear = {};
  yearKeys.forEach(year => {
    const yearData = dataByYear[year].slice(0, TRADING_DAYS);
    if (yearData.length > 0) {
      const basePrice = yearData[0].price;
      simpleReturnsByYear[year] = yearData.map(day => 100 * (day.price / basePrice - 1));
    }
  });

  // Part 2: Calculate Average Seasonal Path using Log Returns
  const dailyLogReturnsByDayNum = {};
  for (let i = 1; i <= TRADING_DAYS; i++) {
      dailyLogReturnsByDayNum[i] = [];
  }

  yearKeys.forEach(year => {
      const yearData = dataByYear[year].slice(0, TRADING_DAYS + 1);
      if (yearData.length < 2) return;

      for (let i = 1; i < yearData.length && i <= TRADING_DAYS; i++) {
          const yesterdayPrice = yearData[i - 1].price;
          const todayPrice = yearData[i].price;
          if (yesterdayPrice > 0 && todayPrice > 0) {
              const dailyLogReturn = Math.log(todayPrice / yesterdayPrice);
              dailyLogReturnsByDayNum[i].push(dailyLogReturn);
          }
      }
  });

  const averageDailyLogReturns = [];
  for (let i = 1; i <= TRADING_DAYS; i++) {
      const returns = dailyLogReturnsByDayNum[i];
      const avg = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
      averageDailyLogReturns.push(avg);
  }

  const averageCumulativePath = [0];
  let cumulativeLogReturn = 0;
  // Note: We loop one less time than the number of days because the first day is always 0.
  for (let i = 0; i < TRADING_DAYS -1; i++) {
      cumulativeLogReturn += averageDailyLogReturns[i];
      const simpleReturn = (Math.exp(cumulativeLogReturn) - 1) * 100;
      averageCumulativePath.push(simpleReturn);
  }
  
  // Part 3: Combine into Final Chart Data
  const finalChartData = [];
  for (let i = 0; i < TRADING_DAYS; i++) {
      const dayData = { name: `Day ${i + 1}`, index: i };
      
      yearKeys.forEach(year => {
          if (simpleReturnsByYear[year] && simpleReturnsByYear[year][i] !== undefined) {
              dayData[year] = parseFloat(simpleReturnsByYear[year][i].toFixed(2));
          }
      });

      if (averageCumulativePath[i] !== undefined) {
          dayData['Average Return'] = parseFloat(averageCumulativePath[i].toFixed(2));
      } else {
          // Fallback for the last day if loop doesn't cover it
          dayData['Average Return'] = finalChartData[i-1]?.['Average Return'] || 0;
      }
      
      finalChartData.push(dayData);
  }

  const finalAvgReturn = finalChartData[finalChartData.length - 1]?.['Average Return'] || 0;
  finalChartData.forEach((d, i) => {
      const trendValue = (i / (TRADING_DAYS - 1)) * finalAvgReturn;
      d['Detrended Average'] = parseFloat((d['Average Return'] - trendValue).toFixed(2));
  });

  return { chartData: finalChartData, yearKeys };
};

const calculateMonthlyReturns = (dailyData, startYear, endYear) => {
    const monthlyReturns = Array.from({ length: 12 }, () => []);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    for (let year = startYear; year <= endYear; year++) {
        for (let month = 0; month < 12; month++) {
            const daysInMonth = Object.entries(dailyData)
                .filter(([date]) => date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
                .map(([date, data]) => ({ date: new Date(date), price: data['4. close'] }))
                .sort((a, b) => a.date - b.date);

            if (daysInMonth.length > 1) {
                const startPrice = daysInMonth[0].price;
                const endPrice = daysInMonth[daysInMonth.length - 1].price;
                const monthlyReturn = (endPrice / startPrice - 1) * 100;
                monthlyReturns[month].push(monthlyReturn);
            }
        }
    }

    return monthNames.map((name, index) => {
        const returns = monthlyReturns[index];
        const average = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
        return { name, avgReturn: parseFloat(average.toFixed(2)) };
    });
};

const calculateDayOfWeekReturns = (dailyData) => {
    const dayReturns = Array.from({ length: 5 }, () => []); // Mon-Fri
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    
    const sortedDates = Object.entries(dailyData).sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));

    for (let i = 1; i < sortedDates.length; i++) {
        const [todayDateStr, todayData] = sortedDates[i];
        const [, yesterdayData] = sortedDates[i-1];
        const dayOfWeek = new Date(todayDateStr).getUTCDay(); // 0=Sun, 1=Mon...

        if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Only Mon-Fri
            if (yesterdayData['4. close'] > 0 && todayData['4. close'] > 0) {
                const logReturn = Math.log(todayData['4. close'] / yesterdayData['4. close']) * 100;
                dayReturns[dayOfWeek - 1].push(logReturn);
            }
        }
    }

    return dayNames.map((name, index) => {
        const returns = dayReturns[index];
        const average = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
        return { name, avgReturn: parseFloat(average.toFixed(4)) };
    });
};

const calculateVolatility = (dailyData) => {
    const sortedDates = Object.entries(dailyData).sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));
    if (sortedDates.length < 2) return 0;
    
    const logReturns = [];
    for (let i = 1; i < sortedDates.length; i++) {
        const [, todayData] = sortedDates[i];
        const [, yesterdayData] = sortedDates[i-1];
        if (yesterdayData['4. close'] > 0 && todayData['4. close'] > 0) {
            logReturns.push(Math.log(todayData['4. close'] / yesterdayData['4. close']));
        }
    }
    
    if (logReturns.length < 2) return 0;
    
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / logReturns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev * 100; // Return as percentage
};


/**
 * Formats the X-axis tick labels from "Day X" to month names.
 */
const formatXAxis = (tickItem) => {
  const dayNum = parseInt(tickItem.split(' ')[1], 10);
  const monthMap = { 1: 'Jan', 22: 'Feb', 43: 'Mar', 64: 'Apr', 85: 'May', 106: 'Jun', 127: 'Jul', 148: 'Aug', 169: 'Sep', 190: 'Oct', 211: 'Nov', 232: 'Dec' };
  return monthMap[dayNum] || '';
};

// --- UI Components ---

/**
 * Custom tooltip with a cosmic aesthetic.
 */
const CustomTooltip = ({ active, payload, label, highlightedYear }) => {
  if (active && payload && payload.length) {
    const sortedPayload = [...payload].sort((a, b) => a.name === 'Average Return' ? -1 : b.name === 'Average Return' ? 1 : a.name.localeCompare(b.name));
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-black/30 backdrop-blur-sm p-3 border border-blue-300/20 shadow-2xl text-xs rounded-lg">
        <div className="space-y-1">
            {sortedPayload.map((p, index) => (
              <p key={index} style={{ color: p.name === 'Average Return' || p.name === 'Detrended Average' ? '#FBBF24' : '#E5E7EB', fontWeight: p.name === 'Average Return' || p.name === highlightedYear ? '600' : '400' }} className="flex justify-between items-center">
                <span>{p.name}:</span>
                <span className="font-semibold ml-4">{p.value}%</span>
              </p>
            ))}
        </div>
      </motion.div>
    );
  }
  return null;
};

/**
 * Stat card designed as telemetry data.
 */
const StatCard = ({ title, value, unit, delay, description, isLast = false }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <motion.div
            className="text-center relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <p className="text-sm text-blue-300/70 mb-1 uppercase tracking-widest">{title}</p>
            <p className="text-3xl font-semibold text-slate-100">{value}<span className="text-2xl text-slate-400 ml-1">{unit}</span></p>
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2 }}
                        className={`absolute bottom-full mb-2 w-48 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-20 ${isLast ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}
                    >
                        {description}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

/**
 * Loading animation.
 */
const LoadingSpinner = () => (
    <div className="flex flex-col items-center justify-center p-8 text-blue-300/70 h-full">
        <motion.div 
          className="w-16 h-16 border-2 border-blue-300/20 rounded-full flex items-center justify-center"
          animate={{ rotate: 360 }} 
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          <div className="w-4 h-4 bg-amber-400 rounded-full shadow-[0_0_10px_#FBBF24]"></div>
        </motion.div>
        <p className="mt-4 tracking-widest text-sm uppercase">Calibrating Trajectory</p>
    </div>
);

/**
 * Main application component.
 */
function App() {
  const [ticker, setTicker] = useState('SPY');
  const [startYear, setStartYear] = useState(new Date().getFullYear() - 20);
  const [endYear, setEndYear] = useState(new Date().getFullYear() - 1);
  const [seasonalityData, setSeasonalityData] = useState(null);
  const [yearKeys, setYearKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentTicker, setCurrentTicker] = useState('');
  const [highlightedYear, setHighlightedYear] = useState(null);
  const [monthlyData, setMonthlyData] = useState([]);
  const [dayOfWeekData, setDayOfWeekData] = useState([]);
  const [fullMetrics, setFullMetrics] = useState(null);
  const [rangeMetrics, setRangeMetrics] = useState(null);
  const [selectedRange, setSelectedRange] = useState({ start: null, end: null });
  const [priceDataByYear, setPriceDataByYear] = useState(null);

  const metricDescriptions = {
    annualizedReturn: "The average compounded return per year, based on the seasonal performance over the selected period.",
    positiveYears: "The percentage of years in the selected range that had a positive return from the first to the last trading day.",
    vectorMagnitude: "The total price change (in points) from the start to the end of the selected period.",
    cosmicFlux: "A measure of volatility (standard deviation of daily log returns). Higher values indicate a less stable trajectory."
  };
  
  const rangeMetricDescriptions = {
    rangeReturn: "The total return over the selected date range on the chart.",
    rangeWinRate: "The percentage of years where the return was positive over the selected seasonal range.",
    rangeMagnitude: "The change in the 'Average Return' value from the start to the end of the selected range.",
    rangeFlux: "A measure of volatility (standard deviation) within the selected range."
  };

  // Run analysis on initial load
  useEffect(() => {
    handleFetchSeasonality();
  }, [])

  const handleLegendClick = (e) => {
    const { dataKey } = e;
    if (dataKey === 'Average Return') return;
    setHighlightedYear(prev => (prev === dataKey ? null : dataKey));
  };

  const handleFetchSeasonality = async (e) => {
    if (e) e.preventDefault();
    if (!ticker) { setError('Please provide a stock ticker.'); return; }
    if (isNaN(startYear) || isNaN(endYear) || startYear > endYear) { setError('Please enter a valid year range.'); return; }
    
    setIsLoading(true);
    setError('');
    setSeasonalityData(null);
    setYearKeys([]);
    setHighlightedYear(null);
    setCurrentTicker(ticker.toUpperCase());
    setFullMetrics(null);
    setRangeMetrics(null);
    setSelectedRange({ start: null, end: null });
    setPriceDataByYear(null);


    const fetchStartDate = new Date(startYear, 0, 1);
    const fetchEndDate = new Date(parseInt(endYear, 10) + 1, 0, 1);

    const period1 = Math.floor(fetchStartDate.getTime() / 1000);
    const period2 = Math.floor(fetchEndDate.getTime() / 1000);
    
    const proxyUrl = 'https://corsproxy.io/?';
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.toUpperCase()}?period1=${period1}&period2=${period2}&interval=1d`;
    const url = proxyUrl + encodeURIComponent(targetUrl);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Network response error (status: ${response.status})`);
      const data = await response.json();

      if (!data || !data.chart || data.chart.error) throw new Error(data?.chart?.error?.description || 'API Error: Invalid ticker or data format.');
      
      const result = data.chart.result?.[0];
      const timestamps = result?.timestamp;
      const adjClose = result?.indicators?.adjclose?.[0]?.adjclose;

      if (!result || !timestamps || !adjClose || timestamps.length === 0) throw new Error('No valid historical data returned for the specified range.');
      
      const firstActualYear = new Date(timestamps[0] * 1000).getFullYear();
      const lastActualYear = new Date(timestamps[timestamps.length - 1] * 1000).getFullYear();

      setStartYear(firstActualYear);
      setEndYear(lastActualYear);

      const formattedDailyData = {};
      for (let i = 0; i < timestamps.length; i++) {
        if (adjClose[i] === null) continue;
        const date = new Date(timestamps[i] * 1000);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${date.getFullYear()}-${month}-${day}`;
        formattedDailyData[dateString] = { '4. close': adjClose[i] };
      }
      
      const dataByYear = {};
      for (const dateStr in formattedDailyData) {
        const year = new Date(dateStr).getFullYear();
        if (!dataByYear[year]) dataByYear[year] = [];
        dataByYear[year].push({ date: new Date(dateStr), price: formattedDailyData[dateStr]['4. close'] });
      }
      for (const year in dataByYear) {
        dataByYear[year].sort((a, b) => a.date - b.date);
      }
      setPriceDataByYear(dataByYear);

      const calculatedData = calculateTradingDaySeasonality(formattedDailyData, firstActualYear, lastActualYear);
      const monthlyReturns = calculateMonthlyReturns(formattedDailyData, firstActualYear, lastActualYear);
      const dowReturns = calculateDayOfWeekReturns(formattedDailyData);
      
      if (calculatedData === null || calculatedData.chartData.length === 0) throw new Error("Calculation failed: Could not process seasonality from data.");
      
      setSeasonalityData(calculatedData.chartData);
      setYearKeys(calculatedData.yearKeys);
      setMonthlyData(monthlyReturns);
      setDayOfWeekData(dowReturns);

      // --- METRICS CALCULATION ---
      const lastDataPoint = calculatedData.chartData[calculatedData.chartData.length - 1];
      const annualizedReturn = lastDataPoint['Average Return'] || 0;

      // Corrected "Positive Years" Calculation
      let positiveYearsCount = 0;
      const totalYears = lastActualYear - firstActualYear + 1;
      for (let year = firstActualYear; year <= lastActualYear; year++) {
          const yearData = Object.entries(formattedDailyData)
              .filter(([date]) => date.startsWith(year.toString()))
              .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));

          if (yearData.length > 1) {
              const firstDayPrice = yearData[0][1]['4. close'];
              const lastDayPrice = yearData[yearData.length - 1][1]['4. close'];
              if (firstDayPrice > 0) {
                  const annualReturn = (lastDayPrice / firstDayPrice) - 1;
                  if (annualReturn > 0) {
                      positiveYearsCount++;
                  }
              }
          }
      }
      const positiveYearsRate = (positiveYearsCount / totalYears) * 100;

      const sortedDates = Object.entries(formattedDailyData).sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));
      const firstDayPrice = sortedDates[0][1]['4. close'];
      const lastDayPrice = sortedDates[sortedDates.length - 1][1]['4. close'];
      const totalPoints = lastDayPrice - firstDayPrice;

      const volatility = calculateVolatility(formattedDailyData);

      setFullMetrics({
          annualizedReturn: annualizedReturn.toFixed(2),
          positiveYears: positiveYearsRate.toFixed(1),
          totalPoints: totalPoints.toFixed(2),
          volatility: volatility.toFixed(2)
      });


    } catch (err) {
      setError(`Data Fetch Error: ${err.message}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChartClick = (e) => {
    if (!e || !e.activeTooltipIndex) return;
    const index = e.activeTooltipIndex;

    if (selectedRange.start === null) {
        setSelectedRange({ start: index, end: null });
    } else if (selectedRange.end === null) {
        if (index > selectedRange.start) {
            setSelectedRange({ ...selectedRange, end: index });
        } else {
            setSelectedRange({ start: index, end: selectedRange.start });
        }
    } else {
        setSelectedRange({ start: index, end: null });
        setRangeMetrics(null);
    }
  };
  
  useEffect(() => {
    if (selectedRange.start !== null && selectedRange.end !== null && seasonalityData && priceDataByYear) {
        const startDayIndex = selectedRange.start;
        const endDayIndex = selectedRange.end;

        let positiveRangeYearsCount = 0;
        let validYearsCount = 0;

        Object.keys(priceDataByYear).forEach(year => {
            const yearData = priceDataByYear[year];
            if (yearData.length > endDayIndex) {
                const startPrice = yearData[startDayIndex]?.price;
                const endPrice = yearData[endDayIndex]?.price;

                if (startPrice && endPrice && startPrice > 0) {
                    validYearsCount++;
                    const logReturn = Math.log(endPrice / startPrice);
                    if (logReturn > 0) {
                        positiveRangeYearsCount++;
                    }
                }
            }
        });

        const rangeWinRate = validYearsCount > 0 ? (positiveRangeYearsCount / validYearsCount) * 100 : 0;

        const slicedData = seasonalityData.slice(startDayIndex, endDayIndex + 1);
        const startValue = slicedData[0]['Average Return'];
        const endValue = slicedData[slicedData.length - 1]['Average Return'];
        const rangeReturn = ((100 + endValue) / (100 + startValue) - 1) * 100;
        const rangeMagnitude = endValue - startValue;
        const returnsInRange = slicedData.map(d => d['Average Return']);
        const mean = returnsInRange.reduce((a, b) => a + b, 0) / returnsInRange.length;
        const variance = returnsInRange.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / returnsInRange.length;
        const rangeFlux = Math.sqrt(variance);

        setRangeMetrics({
            rangeReturn: rangeReturn.toFixed(2),
            rangeWinRate: rangeWinRate.toFixed(1),
            rangeMagnitude: rangeMagnitude.toFixed(2),
            rangeFlux: rangeFlux.toFixed(2)
        });
    }
  }, [selectedRange, seasonalityData, priceDataByYear]);

  const resetSelection = () => {
      setSelectedRange({ start: null, end: null });
      setRangeMetrics(null);
  };
  
  const metrics = rangeMetrics || fullMetrics;
  const descriptions = rangeMetrics ? rangeMetricDescriptions : metricDescriptions;
  
  const lineChartDomain = useMemo(() => {
    if (!seasonalityData) return ['auto', 'auto'];
    const values = seasonalityData.map(d => d['Average Return']);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.abs(max - min) * 0.1;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [seasonalityData]);
  
  const detrendedDomain = useMemo(() => {
    if (!seasonalityData) return ['auto', 'auto'];
    const values = seasonalityData.map(d => d['Detrended Average']);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.abs(max - min) * 0.1;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [seasonalityData]);

  const monthlyDomain = useMemo(() => {
    if (!monthlyData || monthlyData.length === 0) return [-1, 1];
    const maxAbs = Math.ceil(Math.max(...monthlyData.map(d => Math.abs(d.avgReturn))));
    return [-maxAbs, maxAbs];
  }, [monthlyData]);

  const dayOfWeekDomain = useMemo(() => {
    if (!dayOfWeekData || dayOfWeekData.length === 0) return [-0.1, 0.1];
    const maxAbs = Math.max(...dayOfWeekData.map(d => Math.abs(d.avgReturn)));
    return [-maxAbs, maxAbs];
  }, [dayOfWeekData]);


  return (
    <>
      <Analytics />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700&display=swap');
        body { 
            font-family: 'Exo 2', sans-serif; 
            background-color: #010409; 
            color: #E5E7EB;
        }
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
        input[type=number] { -moz-appearance: textfield; }
        .starfield {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-image: 
                radial-gradient(1px 1px at 20% 30%, #93c5fd, transparent),
                radial-gradient(1px 1px at 80% 70%, #93c5fd, transparent),
                radial-gradient(1px 1px at 50% 50%, #e0f2fe, transparent),
                radial-gradient(2px 2px at 90% 10%, #e0f2fe, transparent),
                radial-gradient(2px 2px at 10% 90%, #93c5fd, transparent),
                radial-gradient(1px 1px at 40% 15%, #e0f2fe, transparent),
                radial-gradient(1px 1px at 95% 85%, #93c5fd, transparent),
                radial-gradient(2px 2px at 60% 60%, #e0f2fe, transparent),
                radial-gradient(1px 1px at 75% 45%, #93c5fd, transparent);
            background-size: 100% 100%;
            animation: star-move 120s linear infinite;
        }
        @keyframes star-move {
            from { background-position: 0 0; }
            to { background-position: -10000px 5000px; }
        }
        .control-panel::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: linear-gradient(to bottom, rgba(14, 116, 144, 0.1), transparent);
            border-radius: 0.5rem;
            pointer-events: none;
        }
      `}</style>
      <div className="relative bg-[#010409] min-h-screen overflow-hidden">
        <div className="starfield"></div>
        <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 relative z-10">
          
          <motion.div 
            className="w-full flex flex-col items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl font-bold text-slate-100 mb-2 tracking-tight" style={{textShadow: '0 0 15px rgba(251, 191, 36, 0.5)'}}>Seasonality</h1>
            <p className="text-blue-200/70 text-lg mb-12">Orbital Performance Analysis</p>

            {/* --- Control Deck & Telemetry --- */}
            <div className="w-full max-w-5xl bg-slate-900/50 backdrop-blur-sm border border-blue-300/10 rounded-lg p-6 control-panel relative mb-16">
                <form onSubmit={handleFetchSeasonality} className="flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-grow flex items-center gap-3">
                        <Telescope size={24} className="text-blue-300/70"/>
                        <input 
                            id="ticker" type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} 
                            className="w-full bg-transparent text-2xl text-slate-100 uppercase placeholder-slate-600 focus:outline-none" 
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label htmlFor="startYear" className="text-sm text-blue-300/70">Start Year</label>
                            <input id="startYear" type="number" value={startYear} onChange={e => setStartYear(parseInt(e.target.value))} className="w-24 bg-slate-800 border border-slate-700 rounded-md p-2 text-center text-white focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                        </div>
                        <div className="flex items-center gap-2">
                            <label htmlFor="endYear" className="text-sm text-blue-300/70">End Year</label>
                            <input id="endYear" type="number" value={endYear} onChange={e => setEndYear(parseInt(e.target.value))} className="w-24 bg-slate-800 border border-slate-700 rounded-md p-2 text-center text-white focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                        </div>
                    </div>
                    <button 
                        type="submit" disabled={isLoading} 
                        className="bg-amber-500 hover:bg-amber-400 text-amber-900 font-bold py-3 px-6 transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed rounded-full shadow-[0_0_20px_rgba(251,191,36,0.5)]"
                    >
                        {isLoading ? 'CALCULATING...' : 'OBSERVE'}
                    </button>
                </form>

                {metrics && !isLoading && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-blue-300/10 pt-6 mt-6">
                    <StatCard title={rangeMetrics ? "Range Return" : "Avg. Trajectory"} value={rangeMetrics ? metrics.rangeReturn : fullMetrics.annualizedReturn} unit="%" delay={0.1} description={descriptions.rangeReturn || descriptions.annualizedReturn} />
                    <StatCard title={rangeMetrics ? "Range Win %" : "Positive Years"} value={rangeMetrics ? metrics.rangeWinRate : fullMetrics.positiveYears} unit="%" delay={0.2} description={descriptions.rangeWinRate || descriptions.positiveYears} />
                    <StatCard title={rangeMetrics ? "Range Magnitude" : "Vector Magnitude"} value={rangeMetrics ? metrics.rangeMagnitude : fullMetrics.totalPoints} unit="pts" delay={0.3} description={descriptions.rangeMagnitude || descriptions.vectorMagnitude} />
                    <StatCard title={rangeMetrics ? "Range Flux" : "Cosmic Flux"} value={rangeMetrics ? metrics.rangeFlux : fullMetrics.volatility} unit="%" delay={0.4} description={descriptions.rangeFlux || descriptions.cosmicFlux} isLast={true} />
                  </div>
                )}
            </div>

            {/* --- Chart Canvas --- */}
            <div className="w-full">
                {isLoading && <div className="w-full h-[600px] flex items-center justify-center"><LoadingSpinner /></div>}
                {!isLoading && error && (
                  <div className="w-full h-[600px] flex items-center justify-center text-center text-red-400">
                      <div>
                        <AlertCircle size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-semibold">Signal Lost</p>
                        <p className="text-sm text-red-400/80 max-w-md mt-1">{error}</p>
                      </div>
                  </div>
                )}
                {!isLoading && !error && seasonalityData && (
                    <div className="pb-16">
                        <div className="h-[400px] relative">
                            <h2 style={{ position: 'relative', left: '5px' }} className="text-3xl font-bold text-center mb-6 text-slate-200 tracking-tight">Seasonal Trajectory</h2>
                            {selectedRange.start !== null && (
                                <button onClick={resetSelection} className="absolute top-0 right-0 bg-red-500/20 text-white py-1 px-3 rounded-full text-xs flex items-center gap-1 hover:bg-red-500/40 transition-colors z-20">
                                    <XCircle size={14}/>
                                    Reset Selection
                                </button>
                            )}
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={seasonalityData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} onClick={handleChartClick}>
                                    <defs>
                                        <radialGradient id="starGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                                            <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4}/>
                                            <stop offset="100%" stopColor="#F59E0B" stopOpacity={0}/>
                                        </radialGradient>
                                    </defs>
                                    <CartesianGrid stroke="#1e293b" strokeDasharray="1 10" strokeOpacity={0.5} />
                                    <XAxis dataKey="name" stroke="#475569" tick={{fontSize: 12}} ticks={['Day 1', 'Day 22', 'Day 43', 'Day 64', 'Day 85', 'Day 106', 'Day 127', 'Day 148', 'Day 169', 'Day 190', 'Day 211', 'Day 232']} tickFormatter={formatXAxis} />
                                    <YAxis stroke="#475569" tickFormatter={(tick) => `${tick.toFixed(0)}%`} tick={{fontSize: 12}} domain={lineChartDomain} />
                                    <Tooltip content={<CustomTooltip />} cursor={{stroke: '#F59E0B', strokeWidth: 1, strokeDasharray: '3 3'}}/>
                                    <Area type="monotone" dataKey="Average Return" stroke="#F59E0B" strokeWidth={3} fillOpacity={1} fill="url(#starGlow)" filter="drop-shadow(0 0 15px rgba(251, 191, 36, 0.6))"/>
                                    
                                    {selectedRange.start !== null && <ReferenceLine x={seasonalityData[selectedRange.start].name} stroke="#38bdf8" strokeWidth={2} />}
                                    {selectedRange.end !== null && <ReferenceLine x={seasonalityData[selectedRange.end].name} stroke="#38bdf8" strokeWidth={2} />}
                                    {selectedRange.start !== null && selectedRange.end !== null && (
                                        <ReferenceArea x1={seasonalityData[selectedRange.start].name} x2={seasonalityData[selectedRange.end].name} stroke="#38bdf8" strokeOpacity={0.5} fill="#38bdf8" fillOpacity={0.1} />
                                    )}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="h-[300px] mt-24">
                            <h2 style={{ position: 'relative', left: '5px' }} className="text-3xl font-bold text-center mb-6 text-slate-200 tracking-tight">Detrended Seasonal Path</h2>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={seasonalityData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid stroke="#1e293b" strokeDasharray="1 10" strokeOpacity={0.5} />
                                    <XAxis dataKey="name" stroke="#475569" tick={{fontSize: 12}} ticks={['Day 1', 'Day 22', 'Day 43', 'Day 64', 'Day 85', 'Day 106', 'Day 127', 'Day 148', 'Day 169', 'Day 190', 'Day 211', 'Day 232']} tickFormatter={formatXAxis} />
                                    <YAxis stroke="#475569" tickFormatter={(tick) => `${tick.toFixed(0)}%`} tick={{fontSize: 12}} domain={detrendedDomain} />
                                    <Tooltip content={<CustomTooltip />} cursor={{stroke: '#F59E0B', strokeWidth: 1, strokeDasharray: '3 3'}}/>
                                    <Area type="monotone" dataKey="Detrended Average" stroke="#F59E0B" strokeWidth={3} fillOpacity={1} fill="url(#starGlow)" filter="drop-shadow(0 0 15px rgba(251, 191, 36, 0.6))"/>
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch mt-24">
                            <div className="h-[300px]">
                                <h3 style={{ position: 'relative', left: '5px' }} className="text-xl font-semibold text-center mb-4 text-slate-300 tracking-tight">Monthly Return</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <defs>
                                            <radialGradient id="barGradientPositive" cx="50%" cy="50%" r="50%">
                                                <stop offset="0%" stopColor="#FBBF24" stopOpacity={0.7}/>
                                                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.4}/>
                                            </radialGradient>
                                             <linearGradient id="barGradientNegative" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#475569" stopOpacity={0.6}/>
                                                <stop offset="100%" stopColor="#334155" stopOpacity={0.3}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid stroke="#1e293b" strokeDasharray="1 10" strokeOpacity={0.5} />
                                        <XAxis dataKey="name" stroke="#475569" tick={{fontSize: 12}}/>
                                        <YAxis stroke="#475569" tickFormatter={(tick) => `${tick}%`} tick={{fontSize: 12}} domain={monthlyDomain} />
                                        <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(251, 191, 36, 0.1)'}}/>
                                        <Bar dataKey="avgReturn">
                                            {monthlyData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.avgReturn > 0 ? 'url(#barGradientPositive)' : 'url(#barGradientNegative)'} stroke={entry.avgReturn > 0 ? '#F59E0B' : '#475569'} strokeWidth={2}/>))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                              <div className="h-[300px]">
                                <h3 style={{ position: 'relative', left: '5px' }} className="text-xl font-semibold text-center mb-4 text-slate-300 tracking-tight">Day-of-Week Return</h3>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dayOfWeekData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <defs>
                                            <radialGradient id="barGradientPositive" cx="50%" cy="50%" r="50%">
                                                <stop offset="0%" stopColor="#FBBF24" stopOpacity={0.7}/>
                                                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.4}/>
                                            </radialGradient>
                                             <linearGradient id="barGradientNegative" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#475569" stopOpacity={0.6}/>
                                                <stop offset="100%" stopColor="#334155" stopOpacity={0.3}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid stroke="#1e293b" strokeDasharray="1 10" strokeOpacity={0.5} />
                                        <XAxis dataKey="name" stroke="#475569" tick={{fontSize: 12}}/>
                                        <YAxis stroke="#475569" tickFormatter={(tick) => `${tick.toFixed(3)}%`} tick={{fontSize: 12}} domain={dayOfWeekDomain} />
                                        <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(251, 191, 36, 0.1)'}}/>
                                        <Bar dataKey="avgReturn">
                                            {dayOfWeekData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.avgReturn > 0 ? 'url(#barGradientPositive)' : 'url(#barGradientNegative)'} stroke={entry.avgReturn > 0 ? '#F59E0B' : '#475569'} strokeWidth={2}/>))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}
            </div>

          </motion.div>
        </div>
      </div>
    </>
  );
}

export default App;
