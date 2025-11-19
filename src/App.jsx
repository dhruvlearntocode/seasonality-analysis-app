import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/react";
import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, ReferenceLine, ReferenceArea, ComposedChart } from 'recharts';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { BarChart2, TrendingUp, TrendingDown, Percent, AlertCircle, Telescope, CheckCircle, Sparkles, Bot, Calendar, XCircle, Zap, ShieldCheck, ArrowDown, ArrowUp, ChevronDown, Rocket, Sigma, Terminal } from 'lucide-react';

// --- UI Components (New) ---

const GlassPanel = ({ children, className = "" }) => (
  <div className={`bg-[#0B1221]/80 backdrop-blur-md border border-slate-800/60 shadow-xl rounded-xl ${className}`}>
    {children}
  </div>
);

const NeonBadge = ({ children, color = "blue" }) => {
    const colors = {
        blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        red: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    };
    return (
        <span className={`px-2 py-1 rounded-md text-xs font-medium border ${colors[color]} uppercase tracking-wider`}>
            {children}
        </span>
    )
}

// --- Helper Functions (Shared) ---

const formatXAxis = (tickItem, tradingDaysInYear) => {
  if (!tickItem) return '';
  const dayNum = parseInt(tickItem.split(' ')[1], 10);
  const monthApproximation = Math.floor((dayNum / tradingDaysInYear) * 12);
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return monthNames[monthApproximation] || '';
};

const getMonthTicks = (tradingDaysInYear) => {
    const ticks = [];
    for (let i = 0; i < 12; i++) {
        ticks.push(`Day ${Math.round(tradingDaysInYear / 12 * i) + 1}`);
    }
    return ticks;
};

// Enhanced Tooltip (Redesigned)
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const sortedPayload = [...payload].sort((a, b) => a.name === 'Average Return' ? -1 : b.name === 'Average Return' ? 1 : a.name.localeCompare(b.name));
    return (
      <div className="bg-[#030712] border border-slate-700 p-3 shadow-2xl rounded-lg min-w-[180px]">
        <p className="text-slate-400 text-xs uppercase tracking-wider mb-2 font-semibold border-b border-slate-800 pb-1">{label}</p>
        <div className="space-y-2">
            {sortedPayload.map((p, index) => (
              <div key={index} className="flex justify-between items-center text-xs">
                <span style={{ color: p.color }} className="font-medium flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{backgroundColor: p.color}}></div>
                    {p.name}
                </span>
                <span className="text-slate-200 font-mono tabular-nums font-bold">{p.value.toFixed(2)}%</span>
              </div>
            ))}
        </div>
      </div>
    );
  }
  return null;
};

// Enhanced Loading Spinner
const LoadingSpinner = ({text = "Processing"}) => (
    <div className="flex flex-col items-center justify-center p-12 h-full">
        <div className="relative">
            <div className="w-12 h-12 border-t-2 border-b-2 border-amber-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 bg-blue-500/20 rounded-full animate-pulse"></div>
            </div>
        </div>
        <p className="mt-4 text-xs text-slate-500 uppercase tracking-[0.2em] animate-pulse">{text}</p>
    </div>
);

// --- Seasonality Page Components & Logic ---

const calculateTradingDaySeasonality = (dailyData, userStartYear, userEndYear, tradingDaysInYear) => {
  if (!dailyData || Object.keys(dailyData).length === 0) return null;
  const TRADING_DAYS = tradingDaysInYear;
  
  const dataByYear = {};
  for (const dateStr in dailyData) {
    const year = parseInt(dateStr.substring(0, 4), 10);
    if (!dataByYear[year]) dataByYear[year] = [];
    dataByYear[year].push({ date: new Date(dateStr), price: dailyData[dateStr]['Close'] });
  }

  for (const year in dataByYear) {
    dataByYear[year].sort((a, b) => a.date - b.date);
  }

  const allYearKeys = Object.keys(dataByYear).sort();
  const mostRecentYear = allYearKeys.length > 0 ? allYearKeys[allYearKeys.length - 1] : null;
  
  const pastYearKeys = allYearKeys.filter(y => {
      const yearNum = parseInt(y, 10);
      return yearNum >= userStartYear && yearNum <= userEndYear && y !== mostRecentYear;
  });

  const tradingDaysSoFar = mostRecentYear ? (dataByYear[mostRecentYear]?.length || 0) : 0;

  const simpleReturnsByYear = {};
  allYearKeys.forEach(year => {
    const yearData = dataByYear[year];
    if (yearData && yearData.length > 0) {
      const basePrice = yearData[0].price;
      simpleReturnsByYear[year] = yearData.map(day => 100 * (day.price / basePrice - 1));
    }
  });

  const dailyLogReturnsByDayNum = {};
  for (let i = 1; i <= TRADING_DAYS; i++) {
      dailyLogReturnsByDayNum[i] = [];
  }

  pastYearKeys.forEach(year => {
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
  for (let i = 0; i < TRADING_DAYS -1; i++) {
      cumulativeLogReturn += averageDailyLogReturns[i];
      const simpleReturn = (Math.exp(cumulativeLogReturn) - 1) * 100;
      averageCumulativePath.push(simpleReturn);
  }
  
  const finalChartData = [];
  for (let i = 0; i < TRADING_DAYS; i++) {
      const dayData = { name: `Day ${i + 1}`, index: i };
      
      if (mostRecentYear && i < tradingDaysSoFar && simpleReturnsByYear[mostRecentYear] && simpleReturnsByYear[mostRecentYear][i] !== undefined) {
          dayData['Current Year'] = parseFloat(simpleReturnsByYear[mostRecentYear][i].toFixed(2));
      } else {
          dayData['Current Year'] = null;
      }

      if (averageCumulativePath[i] !== undefined) {
          dayData['Average Return'] = parseFloat(averageCumulativePath[i].toFixed(2));
      } else {
          dayData['Average Return'] = finalChartData[i-1]?.['Average Return'] || 0;
      }
      
      finalChartData.push(dayData);
  }

  const finalAvgReturn = finalChartData[finalChartData.length - 1]?.['Average Return'] || 0;
  finalChartData.forEach((d, i) => {
      const trendValue = (i / (TRADING_DAYS - 1)) * finalAvgReturn;
      d['Detrended Average'] = parseFloat((d['Average Return'] - trendValue).toFixed(2));
  });
  
  const monthTicks = getMonthTicks(tradingDaysInYear);

  return { chartData: finalChartData, yearKeys: pastYearKeys, monthTicks };
};

const calculateMonthlyReturns = (dailyData, startYear, endYear) => {
    const monthlyReturns = Array.from({ length: 12 }, () => []);
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    for (let year = startYear; year <= endYear; year++) {
        for (let month = 0; month < 12; month++) {
            const daysInMonth = Object.entries(dailyData)
                .filter(([date]) => date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
                .map(([date, data]) => ({ date: new Date(date), price: data['Close'] }))
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
    const dayNames = ["MON", "TUE", "WED", "THU", "FRI"];
    
    const sortedDates = Object.entries(dailyData).sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));

    for (let i = 1; i < sortedDates.length; i++) {
        const [todayDateStr, todayData] = sortedDates[i];
        const [, yesterdayData] = sortedDates[i-1];
        const dayOfWeek = new Date(todayDateStr).getUTCDay();

        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            if (yesterdayData['Close'] > 0 && todayData['Close'] > 0) {
                const logReturn = Math.log(todayData['Close'] / yesterdayData['Close']) * 100;
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
        if (yesterdayData['Close'] > 0 && todayData['Close'] > 0) {
            logReturns.push(Math.log(todayData['Close'] / yesterdayData['Close']));
        }
    }
    
    if (logReturns.length < 2) return 0;
    
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / logReturns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev * 100;
};

// Enhanced StatCard (Redesigned)
const StatCard = ({ title, value, unit, delay, description, isLast = false }) => {
    return (
        <motion.div
            className="relative p-4 rounded-xl bg-gradient-to-b from-slate-800/40 to-slate-900/40 border border-slate-800 group hover:border-slate-600 transition-all"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay }}
        >
            <div className="flex justify-between items-start mb-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500">
                    <AlertCircle size={12} />
                </div>
            </div>
            <div className="flex items-baseline gap-1">
                <p className="text-2xl font-mono font-semibold text-slate-100 tracking-tight">{value}</p>
                <span className="text-xs font-medium text-slate-500">{unit}</span>
            </div>
             {/* Tooltip on Hover */}
             <div className="absolute top-full left-0 w-full mt-2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-20">
                <div className="bg-slate-950 border border-slate-800 p-2 rounded text-[10px] text-slate-400 shadow-xl">
                    {description}
                </div>
            </div>
        </motion.div>
    );
};

// Modern Toggle Switch
const AnimatedToggle = ({ enabled, onChange }) => {
    return (
        <button 
            onClick={onChange}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-amber-500' : 'bg-slate-700'}`}
        >
            <span className={`${enabled ? 'translate-x-5' : 'translate-x-1'} inline-block h-3 w-3 transform rounded-full bg-white transition-transform`} />
        </button>
    );
};

function SeasonalityPage({
    ticker, setTicker,
    startYear, setStartYear,
    endYear, setEndYear,
    seasonalityData,
    isLoading,
    error,
    monthlyData,
    dayOfWeekData,
    fullMetrics,
    rangeMetrics,
    selectedRange,
    handleFetchSeasonality,
    handleChartClick,
    resetSelection,
    showCurrentYear, setShowCurrentYear,
    assetClassForChart,
    chartMonthTicks
}) {
  
  const metricDescriptions = {
    annualizedReturn: "Avg compounded return/year.",
    positiveYears: "% of years with positive return.",
    vectorMagnitude: "Total price change (points).",
    cosmicFlux: "Volatility (Std Dev)."
  };
  
  const rangeMetricDescriptions = {
    rangeReturn: "Total return in selection.",
    rangeWinRate: "% years positive in selection.",
    rangeMagnitude: "Avg Return change in selection.",
    rangeFlux: "Volatility in selection."
  };

  const metrics = rangeMetrics || fullMetrics;
  const descriptions = rangeMetrics ? rangeMetricDescriptions : metricDescriptions;
  
  const tradingDaysInYear = ASSET_CLASS_CONFIG[assetClassForChart]?.trading_days_in_year || 251;

  const lineChartDomain = useMemo(() => {
    if (!seasonalityData) return ['auto', 'auto'];
    const values = seasonalityData.flatMap(d => [d['Average Return'], showCurrentYear ? d['Current Year'] : -Infinity]).filter(v => v !== undefined && v !== null && isFinite(v));
    if (values.length === 0) return ['auto', 'auto'];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.abs(max - min) * 0.1;
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [seasonalityData, showCurrentYear]);
  
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
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* HUD Control Bar */}
      <GlassPanel className="p-1">
          <form onSubmit={handleFetchSeasonality} className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 p-2">
              
              {/* Ticker Input - Hero */}
              <div className="flex-grow relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <Telescope size={20} className="text-slate-500 group-focus-within:text-amber-500 transition-colors"/>
                  </div>
                  <input 
                      id="ticker" type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} 
                      className="w-full bg-slate-900/50 border border-slate-700 text-slate-100 rounded-lg py-3 pl-12 pr-4 font-mono text-xl uppercase focus:ring-1 focus:ring-amber-500 focus:border-amber-500 focus:outline-none transition-all placeholder:text-slate-700" 
                      placeholder="TICKER"
                  />
              </div>

              <div className="h-12 w-px bg-slate-800 hidden lg:block mx-2"></div>

              {/* Year Inputs */}
              <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700 rounded-lg p-1">
                  <div className="relative">
                      <span className="absolute top-1 left-2 text-[9px] text-slate-500 font-bold uppercase">Start</span>
                      <input id="startYear" type="number" value={startYear} onChange={e => setStartYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))} 
                        className="w-20 bg-transparent pt-4 pb-1 px-2 text-center text-sm font-mono text-white focus:outline-none border-r border-slate-800" />
                  </div>
                  <div className="relative">
                      <span className="absolute top-1 left-2 text-[9px] text-slate-500 font-bold uppercase">End</span>
                      <input id="endYear" type="number" value={endYear} onChange={e => setEndYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))} 
                        className="w-20 bg-transparent pt-4 pb-1 px-2 text-center text-sm font-mono text-white focus:outline-none" />
                  </div>
              </div>

              {/* Action Button */}
              <button 
                  type="submit" disabled={isLoading} 
                  className="h-12 px-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.3)] disabled:opacity-50 disabled:shadow-none"
              >
                  {isLoading ? <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"/> : <Zap size={18} fill="currentColor"/>}
                  <span>ANALYZE</span>
              </button>
          </form>
      </GlassPanel>

      {metrics && !isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title={rangeMetrics ? "Range Return" : "Ann. Return"} value={rangeMetrics ? metrics.rangeReturn : fullMetrics.annualizedReturn} unit="%" delay={0.1} description={descriptions.rangeReturn || descriptions.annualizedReturn} />
          <StatCard title={rangeMetrics ? "Win Probability" : "Pos. Years"} value={rangeMetrics ? metrics.rangeWinRate : fullMetrics.positiveYears} unit="%" delay={0.2} description={descriptions.rangeWinRate || descriptions.positiveYears} />
          <StatCard title={rangeMetrics ? "Magnitude" : "Total Points"} value={rangeMetrics ? metrics.rangeMagnitude : fullMetrics.totalPoints} unit="pts" delay={0.3} description={descriptions.rangeMagnitude || descriptions.vectorMagnitude} />
          <StatCard title={rangeMetrics ? "Flux (Vol)" : "Volatility"} value={rangeMetrics ? metrics.rangeFlux : fullMetrics.volatility} unit="%" delay={0.4} description={descriptions.rangeFlux || descriptions.cosmicFlux} isLast={true} />
        </div>
      )}

      <div className="w-full min-h-[600px]">
          {isLoading && <GlassPanel className="h-[600px]"><LoadingSpinner /></GlassPanel>}
          
          {!isLoading && error && (
            <GlassPanel className="h-[400px] flex items-center justify-center">
                <div className="text-center">
                  <AlertCircle size={48} className="mx-auto mb-4 text-red-500/50" />
                  <p className="text-lg font-semibold text-red-400">Analysis Failed</p>
                  <p className="text-sm text-slate-500 mt-1">{error}</p>
                </div>
            </GlassPanel>
          )}

          {!isLoading && !error && seasonalityData && (
              <div className="space-y-6">
                
                {/* Main Chart */}
                <GlassPanel className="p-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/20 via-amber-500 to-amber-500/20 opacity-50"></div>
                    
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h2 className="text-xl font-bold text-slate-200 tracking-tight flex items-center gap-2">
                                <TrendingUp size={20} className="text-amber-500"/>
                                Cumulative Trajectory
                            </h2>
                            <p className="text-xs text-slate-500 font-mono mt-1">HISTORICAL COMPOSITE MODEL</p>
                        </div>
                        
                        <div className="flex items-center gap-4">
                             {selectedRange.start !== null && (
                                <motion.button 
                                  onClick={resetSelection} 
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="flex items-center gap-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full transition-colors"
                                >
                                    <XCircle size={14} className="text-red-400"/>
                                    Clear Selection
                                </motion.button>
                            )}
                            <div className="flex items-center gap-3 bg-slate-950/50 rounded-full px-3 py-1.5 border border-slate-800">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Current Year</span>
                                <AnimatedToggle enabled={showCurrentYear} onChange={() => setShowCurrentYear(!showCurrentYear)} />
                            </div>
                        </div>
                    </div>

                    <div className="h-[450px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={seasonalityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} onClick={handleChartClick}>
                                <defs>
                                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                                      <stop offset="0%" stopColor="#F59E0B" />
                                      <stop offset="100%" stopColor="#FBBF24" />
                                  </linearGradient>
                                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} strokeOpacity={0.5} />
                                <XAxis dataKey="name" stroke="#475569" tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}} tickLine={false} axisLine={false} ticks={chartMonthTicks} tickFormatter={(tick) => formatXAxis(tick, tradingDaysInYear)} dy={10} />
                                <YAxis stroke="#475569" tickFormatter={(tick) => `${tick.toFixed(0)}%`} tick={{fontSize: 10, fill: '#64748b', fontFamily: 'monospace'}} tickLine={false} axisLine={false} domain={lineChartDomain} />
                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#fff', strokeWidth: 1, strokeDasharray: '4 4', strokeOpacity: 0.3 }}/>
                                <ReferenceLine y={0} stroke="#ef4444" strokeOpacity={0.4} strokeDasharray="3 3" />
                                
                                {showCurrentYear && (
                                    <Line type="monotone" dataKey="Current Year" stroke="#94a3b8" strokeWidth={2} dot={false} connectNulls={false} strokeDasharray="3 3" strokeOpacity={0.7} />
                                )}
                                
                                <Area type="monotone" dataKey="Average Return" stroke="url(#lineGradient)" strokeWidth={3} fill="url(#areaGradient)" />
                                
                                {selectedRange.start !== null && selectedRange.end !== null && (
                                    <ReferenceArea x1={seasonalityData[selectedRange.start].name} x2={seasonalityData[selectedRange.end].name} fill="#3b82f6" fillOpacity={0.1} />
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </GlassPanel>

                {/* Secondary Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Detrended Chart */}
                    <GlassPanel className="p-6 lg:col-span-3 h-[300px]">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                             <Sigma size={16}/> Detrended Path
                        </h3>
                         <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={seasonalityData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                              <defs>
                                  <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                  </linearGradient>
                              </defs>
                              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                              <XAxis dataKey="name" hide />
                              <YAxis tick={{fontSize: 10, fill: '#64748b', fontFamily: 'monospace'}} tickLine={false} axisLine={false} domain={detrendedDomain} tickFormatter={(v) => v.toFixed(1)} />
                              <Tooltip content={<CustomTooltip />} />
                              <ReferenceLine y={0} stroke="#ef4444" strokeOpacity={0.4} strokeDasharray="3 3" />
                              <Area type="monotone" dataKey="Detrended Average" stroke="#3b82f6" strokeWidth={2} fill="url(#blueGradient)" />
                          </AreaChart>
                        </ResponsiveContainer>
                    </GlassPanel>

                    {/* Monthly Returns */}
                    <GlassPanel className="p-6 h-[300px] lg:col-span-2">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Calendar size={16}/> Monthly Performance
                        </h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                                <XAxis dataKey="name" tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}} tickLine={false} axisLine={false} />
                                <YAxis tick={{fontSize: 10, fill: '#64748b', fontFamily: 'monospace'}} tickLine={false} axisLine={false} domain={monthlyDomain} tickFormatter={(v) => `${v}%`} />
                                <Tooltip content={<CustomTooltip />} cursor={{fill: '#1e293b', opacity: 0.4}}/>
                                <ReferenceLine y={0} stroke="#64748b" strokeOpacity={0.5} />
                                <Bar dataKey="avgReturn" radius={[2, 2, 0, 0]}>
                                    {monthlyData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.avgReturn > 0 ? '#10b981' : '#ef4444'} fillOpacity={0.8} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </GlassPanel>

                    {/* Day of Week */}
                    <GlassPanel className="p-6 h-[300px]">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Day of Week</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={dayOfWeekData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} strokeOpacity={0.3} />
                                <XAxis dataKey="name" tick={{fontSize: 10, fill: '#64748b', fontWeight: 600}} tickLine={false} axisLine={false} />
                                <YAxis tick={{fontSize: 10, fill: '#64748b', fontFamily: 'monospace'}} tickLine={false} axisLine={false} domain={dayOfWeekDomain} tickFormatter={(v) => v.toFixed(2)} />
                                <Tooltip content={<CustomTooltip />} cursor={{fill: '#1e293b', opacity: 0.4}}/>
                                <ReferenceLine y={0} stroke="#64748b" strokeOpacity={0.5} />
                                <Bar dataKey="avgReturn" radius={[2, 2, 0, 0]}>
                                    {dayOfWeekData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.avgReturn > 0 ? '#3b82f6' : '#ef4444'} fillOpacity={0.8} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </GlassPanel>
                </div>
              </div>
          )}
      </div>
    </div>
  )
}

// --- In-Season Scanner Page Components & Logic ---

// Helper component for enhanced <select>
const StyledSelect = ({ id, value, onChange, children, label }) => (
    <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{label}</label>
        <div className="relative">
            <select 
                id={id} 
                value={value} 
                onChange={onChange} 
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-lg py-2.5 px-3 appearance-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
            >
                {children}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
    </div>
);

function InSeasonPage({
    winRateThreshold, setWinRateThreshold,
    forwardMonths, setForwardMonths,
    seasonalityYears, setSeasonalityYears,
    scannerIsLoading,
    scannerResults,
    scanCompleted,
    handleScan,
    scannerError,
    strictYears, setStrictYears,
    onTickerClick,
    sortConfig, setSortConfig,
    assetClass, setAssetClass
}) {

  const displayedResults = useMemo(() => {
    if (!scanCompleted) return [];
    
    let filtered = [...scannerResults];

    if (strictYears) {
        filtered = filtered.filter(item => item.yearsOfData >= seasonalityYears);
    }
    
    const sortableItems = [...filtered];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [scannerResults, sortConfig, strictYears, seasonalityYears, scanCompleted]);

  const requestSort = (key) => {
    let direction = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') {
      direction = 'ascending';
    }
    setSortConfig({ key, direction });
  };
  
  const handleSubmit = (e) => {
      e.preventDefault();
      handleScan();
  }

  const SortableHeader = ({ children, name, align = "left" }) => {
    const isSorted = sortConfig.key === name;
    return (
        <th scope="col" className={`px-6 py-4 text-${align} text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors bg-slate-950/50`} onClick={() => requestSort(name)}>
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                {children}
                <div className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-0'}`}>
                     {sortConfig.direction === 'ascending' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                </div>
            </div>
        </th>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      <GlassPanel className="p-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
          {/* Controls */}
          <div className="col-span-2 md:col-span-1">
             <StyledSelect id="assetClass" label="Asset Class" value={assetClass} onChange={e => setAssetClass(e.target.value)}>
                <option value="Stocks">Stocks</option>
                <option value="ETFs">ETFs</option>
                <option value="India Stocks">India Stocks</option>
                <option value="Crypto">Crypto</option>
             </StyledSelect>
          </div>
          
          <div className="col-span-2 md:col-span-1">
             <div className="flex flex-col gap-1">
                <label htmlFor="winRate" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Min Win Rate</label>
                <div className="relative">
                    <input id="winRate" type="number" value={winRateThreshold} onChange={e => setWinRateThreshold(e.target.value)} 
                        className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm rounded-lg py-2.5 px-3 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all" />
                    <Percent className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                </div>
             </div>
          </div>

          <div className="col-span-1">
              <StyledSelect id="forwardMonths" label="Duration" value={forwardMonths} onChange={e => setForwardMonths(parseInt(e.target.value))}>
                  <option value="1">1 Month</option>
                  <option value="2">2 Months</option>
                  <option value="3">3 Months</option>
              </StyledSelect>
          </div>

          <div className="col-span-1">
              <StyledSelect id="seasonalityYears" label="Lookback" value={seasonalityYears} onChange={e => setSeasonalityYears(parseInt(e.target.value))}>
                  <option value="5">5 Years</option>
                  <option value="10">10 Years</option>
                  <option value="20">20 Years</option>
              </StyledSelect>
          </div>

          <div className="col-span-2">
              <button 
                  type="submit" disabled={scannerIsLoading} 
                  className="w-full h-[42px] bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 disabled:opacity-50"
              >
                  {scannerIsLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Rocket size={16}/>}
                  RUN SCANNER
              </button>
          </div>
        </form>
      </GlassPanel>

      {/* Results */}
      <div className="w-full">
        {scannerIsLoading && <GlassPanel className="h-[400px]"><LoadingSpinner text="Scanning Market Data..."/></GlassPanel>}
        {!scannerIsLoading && scannerError && <div className="text-center py-12 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">{scannerError}</div>}
        {!scannerIsLoading && !scannerError && scanCompleted && (
          <motion.div initial={{opacity: 0}} animate={{opacity: 1}}>
            <div className="flex justify-between items-center mb-4 px-2">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Terminal size={16}/> Scan Results: {displayedResults.length} Tickers
                </h2>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 rounded-full border border-slate-800">
                    <label htmlFor="strict-toggle" className="text-xs text-slate-400 font-medium mr-2">Strict Data Check</label>
                    <AnimatedToggle enabled={strictYears} onChange={() => setStrictYears(!strictYears)} />
                </div>
            </div>
            
            {displayedResults.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0B1221]/90 backdrop-blur shadow-2xl">
                <table className="min-w-full divide-y divide-slate-800">
                    <thead>
                        <tr>
                            <SortableHeader name="ticker">Symbol</SortableHeader>
                            <SortableHeader name="winRate">Win Rate</SortableHeader>
                            <SortableHeader name="avgReturn" align="right">Avg Rtn</SortableHeader>
                            <SortableHeader name="maxProfit" align="right">Max Gain</SortableHeader>
                            <SortableHeader name="maxLoss" align="right">Max Drawdown</SortableHeader>
                            <SortableHeader name="yearsOfData" align="right">Data (Yrs)</SortableHeader>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        <AnimatePresence>
                        {displayedResults.map((item, idx) => (
                            <motion.tr 
                                key={item.ticker} 
                                className="hover:bg-slate-800/30 transition-colors group"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: idx * 0.03 }}
                            >
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <button onClick={() => onTickerClick(item.ticker)} className="text-sm font-bold text-blue-400 group-hover:text-blue-300 group-hover:underline underline-offset-4 font-mono">
                                        {item.ticker}
                                    </button>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <NeonBadge color={item.winRate > 80 ? "green" : item.winRate > 60 ? "blue" : "amber"}>
                                        {item.winRate.toFixed(0)}%
                                    </NeonBadge>
                                </td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-medium ${item.avgReturn > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{item.avgReturn > 0 ? '+' : ''}{item.avgReturn.toFixed(2)}%</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right text-slate-400">{item.maxProfit.toFixed(2)}%</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right text-rose-400/80">{item.maxLoss.toFixed(2)}%</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right text-slate-500">{item.yearsOfData}</td>
                            </motion.tr>
                        ))}
                        </AnimatePresence>
                    </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 bg-slate-900/20 border border-slate-800 border-dashed rounded-xl text-slate-500">
                <ShieldCheck size={48} className="mb-4 opacity-20"/>
                <p className="text-lg font-medium">No opportunities found</p>
                <p className="text-sm opacity-60">Adjust filters to broaden your search.</p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}


/**
 * Main application component with navigation and state management.
 */

const ASSET_CLASS_CONFIG = {
    'Stocks': { trading_days_in_year: 251 },
    'ETFs': { trading_days_in_year: 251 },
    'India Stocks': { trading_days_in_year: 252 },
    'Crypto': { trading_days_in_year: 365 },
};

function getAssetClassFromTicker(ticker) {
    if (ticker.endsWith('-USD')) return 'Crypto';
    if (ticker.endsWith('.NS')) return 'India Stocks';
    const commonETFs = ['SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'SLV', 'USO'];
    if (commonETFs.includes(ticker)) return 'ETFs';
    return 'Stocks';
}


function App() {
  const [page, setPage] = useState('seasonality');

  // --- State for SeasonalityPage ---
  const [ticker, setTicker] = useState('SPY');
  const [startYear, setStartYear] = useState(new Date().getFullYear() - 20);
  const [endYear, setEndYear] = useState(new Date().getFullYear() - 1);
  const [seasonalityData, setSeasonalityData] = useState(null);
  const [seasonalityIsLoading, setSeasonalityIsLoading] = useState(false);
  const [seasonalityError, setSeasonalityError] = useState('');
  const [monthlyData, setMonthlyData] = useState([]);
  const [dayOfWeekData, setDayOfWeekData] = useState([]);
  const [fullMetrics, setFullMetrics] = useState(null);
  const [rangeMetrics, setRangeMetrics] = useState(null);
  const [selectedRange, setSelectedRange] = useState({ start: null, end: null });
  const [priceDataByYear, setPriceDataByYear] = useState(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [showCurrentYear, setShowCurrentYear] = useState(false);
  const [currentAssetClassForChart, setCurrentAssetClassForChart] = useState('ETFs');
  const [chartMonthTicks, setChartMonthTicks] = useState([]);

  // --- State for InSeasonPage ---
  const [allScanData, setAllScanData] = useState(null);
  const [winRateThreshold, setWinRateThreshold] = useState('60');
  const [forwardMonths, setForwardMonths] = useState(2);
  const [seasonalityYears, setSeasonalityYears] = useState(10);
  const [scannerIsLoading, setScannerIsLoading] = useState(false);
  const [scannerResults, setScannerResults] = useState([]);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [strictYears, setStrictYears] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'winRate', direction: 'descending' });
  const [assetClass, setAssetClass] = useState('Stocks');

  // --- Logic for SeasonalityPage ---
  useEffect(() => {
    if (page === 'seasonality') {
        handleFetchSeasonality();
    }
  }, [page, refetchTrigger]);
  
  // --- Logic for InSeasonPage ---
  useEffect(() => {
    if (page === 'in-season' && !allScanData) {
        setScannerIsLoading(true);
        fetch('/scan_results.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load scan data. The daily scan may not have run yet.');
                }
                return response.json();
            })
            .then(data => {
                setAllScanData(data);
                setScannerIsLoading(false);
            })
            .catch(error => {
                console.error("Failed to load scan results:", error);
                setScannerError(error.message);
                setScannerIsLoading(false);
            });
    }
  }, [page, allScanData]);


  const handleFetchSeasonality = async (e) => {
    if (e) e.preventDefault();
    if (!ticker) { setSeasonalityError('Please provide a stock ticker.'); return; }
    const startYearNum = parseInt(startYear, 10);
    const endYearNum = parseInt(endYear, 10);
    if (isNaN(startYearNum) || isNaN(endYearNum) || startYearNum > endYearNum) { setSeasonalityError('Please enter a valid year range.'); return; }
    
    setSeasonalityIsLoading(true);
    setSeasonalityError('');
    setSeasonalityData(null);
    setFullMetrics(null);
    setRangeMetrics(null);
    setSelectedRange({ start: null, end: null });
    setPriceDataByYear(null);

    const url = `/api/fetch_seasonality?ticker=${ticker.toUpperCase()}&startYear=${startYearNum}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
              const errorData = await response.json();
              throw new Error(errorData.error || `API Error (status: ${response.status})`);
          } else {
              const errorText = await response.text();
              throw new Error(`Network response error (status: ${response.status}). Response: ${errorText.substring(0, 500)}`);
          }
      }
      
      const data = await response.json();
      if (Object.keys(data).length === 0) {
          throw new Error('No valid historical data returned for the specified range.');
      }
      
      const formattedDailyData = data;
      
      const dataByYear = {};
      for (const dateStr in formattedDailyData) {
        const year = new Date(dateStr).getFullYear();
        if (!dataByYear[year]) dataByYear[year] = [];
        dataByYear[year].push({ date: new Date(dateStr), price: formattedDailyData[dateStr]['Close'] });
      }
      for (const year in dataByYear) { dataByYear[year].sort((a, b) => a.date - b.date); }
      setPriceDataByYear(dataByYear);

      const firstActualYear = new Date(Object.keys(formattedDailyData)[0]).getFullYear();
      if (firstActualYear > startYearNum) {
          setStartYear(firstActualYear);
      }
      
      const assetTypeForChart = getAssetClassFromTicker(ticker.toUpperCase());
      setCurrentAssetClassForChart(assetTypeForChart);
      const tradingDaysInYear = ASSET_CLASS_CONFIG[assetTypeForChart]?.trading_days_in_year || 251;

      const calculatedData = calculateTradingDaySeasonality(formattedDailyData, startYearNum, endYearNum, tradingDaysInYear);
      if (calculatedData === null || calculatedData.chartData.length === 0) throw new Error("Calculation failed: Could not process seasonality from data.");
      
      setSeasonalityData(calculatedData.chartData);
      setChartMonthTicks(calculatedData.monthTicks);
      setMonthlyData(calculateMonthlyReturns(formattedDailyData, startYearNum, endYearNum));
      setDayOfWeekData(calculateDayOfWeekReturns(formattedDailyData));

      const lastDataPoint = calculatedData.chartData[calculatedData.chartData.length - 1];
      const annualizedReturn = lastDataPoint['Average Return'] || 0;
      let positiveYearsCount = 0;
      const totalYears = endYearNum - startYearNum + 1;
      for (let year = startYearNum; year <= endYearNum; year++) {
          const yearData = Object.entries(formattedDailyData).filter(([date]) => date.startsWith(year.toString())).sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));
          if (yearData.length > 1) {
              const firstDayPrice = yearData[0][1]['Close'];
              const lastDayPrice = yearData[yearData.length - 1][1]['Close'];
              if (firstDayPrice > 0 && (lastDayPrice / firstDayPrice) - 1 > 0) { positiveYearsCount++; }
          }
      }
      const positiveYearsRate = (positiveYearsCount / totalYears) * 100;
      const sortedDates = Object.entries(formattedDailyData).sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));
      const firstDayPrice = sortedDates[0][1]['Close'];
      const lastDayPrice = sortedDates[sortedDates.length - 1][1]['Close'];
      const totalPoints = lastDayPrice - firstDayPrice;
      const volatility = calculateVolatility(formattedDailyData);
      setFullMetrics({ annualizedReturn: annualizedReturn.toFixed(2), positiveYears: positiveYearsRate.toFixed(1), totalPoints: totalPoints.toFixed(2), volatility: volatility.toFixed(2) });
    } catch (err) {
      setSeasonalityError(`Data Fetch Error: ${err.message}`);
      console.error(err);
    } finally {
      setSeasonalityIsLoading(false);
    }
  };

  const handleChartClick = (e) => {
    if (!e || !e.activeTooltipIndex) return;
    const index = e.activeTooltipIndex;
    if (selectedRange.start === null) { setSelectedRange({ start: index, end: null }); }
    else if (selectedRange.end === null) {
        const newEnd = index > selectedRange.start ? index : selectedRange.start;
        const newStart = index > selectedRange.start ? selectedRange.start : index;
        setSelectedRange({ start: newStart, end: newEnd });
    } else {
        setSelectedRange({ start: index, end: null });
        setRangeMetrics(null);
    }
  };
  
  useEffect(() => {
    if (selectedRange.start !== null && selectedRange.end !== null && seasonalityData && priceDataByYear) {
        const startDayIndex = selectedRange.start;
        const endDayIndex = selectedRange.end;
        let rangeReturns = [];
        
        Object.keys(priceDataByYear).forEach(year => {
            const yearNum = parseInt(year, 10);
            if(yearNum >= startYear && yearNum <= endYear) {
                const yearData = priceDataByYear[year];
                if (yearData.length > endDayIndex) {
                    const startPrice = yearData[startDayIndex]?.price;
                    const endPrice = yearData[endDayIndex]?.price;
                    if (startPrice && endPrice && startPrice > 0) {
                        const logReturn = Math.log(endPrice / startPrice);
                        rangeReturns.push(logReturn);
                    }
                }
            }
        });

        if (rangeReturns.length > 0) {
            const positiveReturns = rangeReturns.filter(r => r > 0);
            const rangeWinRate = (positiveReturns.length / rangeReturns.length) * 100;
            
            const avgLogReturn = rangeReturns.reduce((a, b) => a + b, 0) / rangeReturns.length;
            const avgSimpleReturn = (Math.exp(avgLogReturn) - 1) * 100;

            const mean = rangeReturns.reduce((a, b) => a + b, 0) / rangeReturns.length;
            const variance = rangeReturns.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / rangeReturns.length;
            const rangeFlux = Math.sqrt(variance) * 100; // As a percentage

            const slicedData = seasonalityData.slice(startDayIndex, endDayIndex + 1);
            const startValue = slicedData[0]['Average Return'];
            const endValue = slicedData[slicedData.length - 1]['Average Return'];
            const rangeMagnitude = endValue - startValue;

            setRangeMetrics({
                rangeReturn: avgSimpleReturn.toFixed(2),
                rangeWinRate: rangeWinRate.toFixed(1),
                rangeMagnitude: rangeMagnitude.toFixed(2),
                rangeFlux: rangeFlux.toFixed(2)
            });
        } else {
            setRangeMetrics(null);
        }
    }
  }, [selectedRange, seasonalityData, priceDataByYear, startYear, endYear]);

  const resetSelection = () => {
      setSelectedRange({ start: null, end: null });
      setRangeMetrics(null);
  };

  // --- Logic for InSeasonPage ---
  const handleScan = () => {
    if (!allScanData) {
        setScannerError("Scan data is not loaded yet. Please wait a moment.");
        return;
    }
    
    setScannerIsLoading(true);
    setScannerError('');
    setScanCompleted(false);

    const threshold = parseInt(winRateThreshold, 10);
    if (isNaN(threshold)) {
        setScannerError("Win Rate Threshold must be a valid number.");
        setScannerIsLoading(false);
        return;
    }
    
    setTimeout(() => {
        const dataKey = `${forwardMonths}m_${seasonalityYears}y`;
        const permutationResults = allScanData[assetClass]?.[dataKey] || [];

        const successfulTickers = permutationResults.filter(metrics => metrics.winRate >= threshold);
        
        setScannerResults(successfulTickers);
        setScanCompleted(true);
        setScannerIsLoading(false);
    }, 50);
  };

  const handleTickerClickFromScanner = (clickedTicker) => {
    setTicker(clickedTicker);
    const currentYear = new Date().getFullYear();
    setStartYear(currentYear - seasonalityYears);
    setEndYear(currentYear - 1);
    setCurrentAssetClassForChart(assetClass); // Set the asset class for the chart
    setPage('seasonality');
    setRefetchTrigger(prev => prev + 1);
  };

  // --- Navigation ---
  const NavButton = ({ targetPage, children, icon: Icon }) => (
    <button 
      onClick={() => setPage(targetPage)}
      className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all relative overflow-hidden group ${page === targetPage ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
    >
      {page === targetPage && (
        <motion.div
            className="absolute inset-0 bg-blue-500/10 border border-blue-500/20 rounded-lg z-0"
            layoutId="nav-highlight"
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2">
        {Icon && <Icon size={16} className={page === targetPage ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"} />}
        {children}
      </span>
    </button>
  );

  return (
    <>
		<Analytics />
	    <SpeedInsights />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #020617; color: #E2E8F0; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        
        /* Subtle Grid Background */
        .bg-grid {
            background-size: 40px 40px;
            background-image: linear-gradient(to right, rgba(30, 41, 59, 0.3) 1px, transparent 1px),
                              linear-gradient(to bottom, rgba(30, 41, 59, 0.3) 1px, transparent 1px);
        }
      `}</style>
      <div className="relative min-h-screen overflow-x-hidden bg-[#020617] bg-grid">
        {/* Ambient Glows */}
        <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px] pointer-events-none"></div>
        <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-[128px] pointer-events-none"></div>
        
        <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 relative z-10">
          
          <header className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <TrendingUp size={18} className="text-white" strokeWidth={3}/>
                    </div>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        Seasonality<span className="font-light text-slate-500">Pro</span>
                    </span>
                </h1>
                <p className="text-slate-500 text-sm mt-1 font-medium ml-1">QUANTITATIVE CYCLE ANALYSIS</p>
            </div>
            
            <nav className="bg-slate-950/50 backdrop-blur-xl border border-slate-800 rounded-xl p-1.5 flex shadow-2xl">
                <LayoutGroup>
                    <NavButton targetPage="seasonality" icon={BarChart2}>Analysis</NavButton>
                    <NavButton targetPage="in-season" icon={Telescope}>Scanner</NavButton>
                </LayoutGroup>
            </nav>
          </header>
          
          <main>
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {page === 'seasonality' && (
                    <SeasonalityPage
                        ticker={ticker} setTicker={setTicker}
                        startYear={startYear} setStartYear={setStartYear}
                        endYear={endYear} setEndYear={setEndYear}
                        seasonalityData={seasonalityData}
                        isLoading={seasonalityIsLoading}
                        error={seasonalityError}
                        monthlyData={monthlyData}
                        dayOfWeekData={dayOfWeekData}
                        fullMetrics={fullMetrics}
                        rangeMetrics={rangeMetrics}
                        selectedRange={selectedRange}
                        handleFetchSeasonality={handleFetchSeasonality}
                        handleChartClick={handleChartClick}
                        resetSelection={resetSelection}
                        showCurrentYear={showCurrentYear}
                        setShowCurrentYear={setShowCurrentYear}
                        assetClassForChart={currentAssetClassForChart}
                        chartMonthTicks={chartMonthTicks}
                    />
                )}
                {page === 'in-season' && (
                    <InSeasonPage 
                        winRateThreshold={winRateThreshold} setWinRateThreshold={setWinRateThreshold}
                        forwardMonths={forwardMonths} setForwardMonths={setForwardMonths}
                        seasonalityYears={seasonalityYears} setSeasonalityYears={setSeasonalityYears}
                        scannerIsLoading={scannerIsLoading}
                        scannerResults={scannerResults}
                        scanCompleted={scanCompleted}
                        handleScan={handleScan}
                        scannerError={scannerError}
                        strictYears={strictYears}
                        setStrictYears={setStrictYears}
                        onTickerClick={handleTickerClickFromScanner}
                        sortConfig={sortConfig}
                        setSortConfig={setSortConfig}
                        assetClass={assetClass}
                        setAssetClass={setAssetClass}
                    />
                )}
              </motion.div>
            </AnimatePresence>
          </main>

            <footer className="mt-24 border-t border-slate-800/50 pt-8 pb-12">
                <div className="text-center">
                    <div className="inline-flex items-center gap-2 text-slate-600 mb-4">
                        <Sigma size={14}/>
                        <span className="text-xs font-mono tracking-widest uppercase">Algorithm v2.4</span>
                    </div>
                    <p className="text-xs text-slate-600 max-w-2xl mx-auto leading-relaxed">
                        Market data provided by Yahoo Finance API. Calculations are based on historical adjusted closing prices. 
                        <br/>Past performance does not guarantee future results. Not financial advice.
                    </p>
                </div>
            </footer>
        </div>
      </div>
    </>
  );
}

export default App;
