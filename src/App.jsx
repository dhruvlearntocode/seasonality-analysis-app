import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/react";
import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, BarChart, Bar, Cell, ReferenceLine, ReferenceArea, ComposedChart } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, BarChart2, TrendingUp, TrendingDown, Percent, AlertCircle, Telescope, CheckCircle, Sparkles, Bot, Calendar, XCircle, Zap, ShieldCheck, ArrowDown, ArrowUp, ChevronDown } from 'lucide-react';

// --- Helper Functions (Shared) ---

const formatXAxis = (tickItem) => {
  const dayNum = parseInt(tickItem.split(' ')[1], 10);
  const monthMap = { 1: 'Jan', 22: 'Feb', 43: 'Mar', 64: 'Apr', 85: 'May', 106: 'Jun', 127: 'Jul', 148: 'Aug', 169: 'Sep', 190: 'Oct', 211: 'Nov', 232: 'Dec' };
  return monthMap[dayNum] || '';
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const sortedPayload = [...payload].sort((a, b) => a.name === 'Average Return' ? -1 : b.name === 'Average Return' ? 1 : a.name.localeCompare(b.name));
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-black/30 backdrop-blur-sm p-3 border border-blue-300/20 shadow-2xl text-xs rounded-lg">
        <div className="space-y-1">
            {sortedPayload.map((p, index) => (
              <p key={index} style={{ color: p.name === 'Average Return' || p.name === 'Detrended Average' ? '#FBBF24' : p.name === 'Current Year' ? '#C0C0C0' : '#E5E7EB', fontWeight: p.name === 'Average Return' || p.name === 'Current Year' ? '600' : '400' }} className="flex justify-between items-center">
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

const LoadingSpinner = ({text = "Calibrating Trajectory"}) => (
    <div className="flex flex-col items-center justify-center p-8 text-blue-300/70 h-full">
        <motion.div 
          className="w-16 h-16 border-2 border-blue-300/20 rounded-full flex items-center justify-center"
          animate={{ rotate: 360 }} 
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        >
          <div className="w-4 h-4 bg-amber-400 rounded-full shadow-[0_0_10px_#FBBF24]"></div>
        </motion.div>
        <p className="mt-4 tracking-widest text-sm uppercase">{text}</p>
    </div>
);

// --- Seasonality Page Components & Logic ---

const calculateTradingDaySeasonality = (dailyData, userStartYear, userEndYear) => {
  if (!dailyData || Object.keys(dailyData).length === 0) return null;
  const TRADING_DAYS = 251;
  
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

  return { chartData: finalChartData, yearKeys: pastYearKeys };
};

const calculateMonthlyReturns = (dailyData, startYear, endYear) => {
    const monthlyReturns = Array.from({ length: 12 }, () => []);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    
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
    showCurrentYear, setShowCurrentYear
}) {
  
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

  const metrics = rangeMetrics || fullMetrics;
  const descriptions = rangeMetrics ? rangeMetricDescriptions : metricDescriptions;
  
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
    <>
      <h1 className="text-5xl font-bold text-slate-100 mb-2 tracking-tight text-center" style={{textShadow: '0 0 15px rgba(251, 191, 36, 0.5)'}}>Seasonality</h1>
      <p className="text-blue-200/70 text-lg mb-12 text-center">Orbital Performance Analysis</p>

      <div className="w-full max-w-5xl bg-slate-900/50 backdrop-blur-sm border border-blue-300/10 rounded-lg p-6 control-panel relative mb-16 mx-auto">
          <form onSubmit={handleFetchSeasonality} className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-grow flex items-center gap-3">
                  <Telescope size={24} className="text-blue-300/70"/>
                  <input 
                      id="ticker" type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} 
                      className="w-full bg-transparent text-2xl text-slate-100 uppercase placeholder-slate-600 focus:outline-none border-b-2 border-slate-700 focus:border-amber-500 pb-1 transition-colors" 
                  />
              </div>
              <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                      <label htmlFor="startYear" className="text-sm text-blue-300/70">Start</label>
                      <input id="startYear" type="number" value={startYear} onChange={e => setStartYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))} className="w-24 bg-slate-800 border border-slate-700 rounded-md p-2 text-center text-white focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                      <label htmlFor="endYear" className="text-sm text-blue-300/70">End</label>
                      <input id="endYear" type="number" value={endYear} onChange={e => setEndYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))} className="w-24 bg-slate-800 border border-slate-700 rounded-md p-2 text-center text-white focus:ring-2 focus:ring-amber-500 focus:outline-none" />
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
                      <h2 className="text-3xl font-bold text-center mb-6 text-slate-200 tracking-tight">Seasonal Trajectory</h2>
                      <div className="absolute top-2 right-2 flex flex-col items-end gap-2 z-20">
                          <div className="h-7"> {/* Placeholder for Reset button */}
                              {selectedRange.start !== null && (
                                  <button onClick={resetSelection} className="bg-red-500/20 text-white py-1 px-3 rounded-full text-xs flex items-center gap-1 hover:bg-red-500/40 transition-colors">
                                      <XCircle size={14}/>
                                      Reset Selection
                                  </button>
                              )}
                          </div>
                          <div className="flex items-center gap-2">
                              <label htmlFor="current-year-toggle" className="text-xs text-blue-300/70">Show Current Year</label>
                              <button id="current-year-toggle" type="button" onClick={() => setShowCurrentYear(!showCurrentYear)} className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${showCurrentYear ? 'bg-amber-500' : 'bg-slate-700'}`}>
                                  <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${showCurrentYear ? 'translate-x-6' : 'translate-x-1'}`} />
                              </button>
                          </div>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={seasonalityData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} onClick={handleChartClick}>
                              <defs><radialGradient id="starGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%"><stop offset="0%" stopColor="#FBBF24" stopOpacity={0.4}/><stop offset="100%" stopColor="#F59E0B" stopOpacity={0}/></radialGradient></defs>
                              <CartesianGrid stroke="#1e293b" strokeDasharray="1 10" strokeOpacity={0.5} />
                              <XAxis dataKey="name" stroke="#475569" tick={{fontSize: 12}} ticks={['Day 1', 'Day 22', 'Day 43', 'Day 64', 'Day 85', 'Day 106', 'Day 127', 'Day 148', 'Day 169', 'Day 190', 'Day 211', 'Day 232']} tickFormatter={formatXAxis} />
                              <YAxis stroke="#475569" tickFormatter={(tick) => `${tick.toFixed(0)}%`} tick={{fontSize: 12}} domain={lineChartDomain} />
                              <Tooltip content={<CustomTooltip />} cursor={{stroke: '#F59E0B', strokeWidth: 1, strokeDasharray: '3 3'}}/>
                              <Area type="monotone" dataKey="Average Return" stroke="#F59E0B" strokeWidth={3} fillOpacity={1} fill="url(#starGlow)" filter="drop-shadow(0 0 15px rgba(251, 191, 36, 0.6))"/>
                              {showCurrentYear && <Line type="monotone" dataKey="Current Year" stroke="#C0C0C0" strokeWidth={3} dot={false} connectNulls={false} filter="drop-shadow(0 0 10px #C0C0C0)" />}
                              {selectedRange.start !== null && <ReferenceLine x={seasonalityData[selectedRange.start].name} stroke="#38bdf8" strokeWidth={2} />}
                              {selectedRange.end !== null && <ReferenceLine x={seasonalityData[selectedRange.end].name} stroke="#38bdf8" strokeWidth={2} />}
                              {selectedRange.start !== null && selectedRange.end !== null && <ReferenceArea x1={seasonalityData[selectedRange.start].name} x2={seasonalityData[selectedRange.end].name} stroke="#38bdf8" strokeOpacity={0.5} fill="#38bdf8" fillOpacity={0.1} />}
                          </ComposedChart>
                      </ResponsiveContainer>
                  </div>

                  <div className="h-[300px] mt-24">
                      <h2 className="text-3xl font-bold text-center mb-6 text-slate-200 tracking-tight">Detrended Seasonal Path</h2>
                      <ResponsiveContainer width="100%" height="100%"><AreaChart data={seasonalityData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}><CartesianGrid stroke="#1e293b" strokeDasharray="1 10" strokeOpacity={0.5} /><XAxis dataKey="name" stroke="#475569" tick={{fontSize: 12}} ticks={['Day 1', 'Day 22', 'Day 43', 'Day 64', 'Day 85', 'Day 106', 'Day 127', 'Day 148', 'Day 169', 'Day 190', 'Day 211', 'Day 232']} tickFormatter={formatXAxis} /><YAxis stroke="#475569" tickFormatter={(tick) => `${tick.toFixed(0)}%`} tick={{fontSize: 12}} domain={detrendedDomain} /><Tooltip content={<CustomTooltip />} cursor={{stroke: '#F59E0B', strokeWidth: 1, strokeDasharray: '3 3'}}/><Area type="monotone" dataKey="Detrended Average" stroke="#F59E0B" strokeWidth={3} fillOpacity={1} fill="url(#starGlow)" filter="drop-shadow(0 0 15px rgba(251, 191, 36, 0.6))"/></AreaChart></ResponsiveContainer>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch mt-24">
                      <div className="h-[300px]"><h3 className="text-xl font-semibold text-center mb-4 text-slate-300 tracking-tight">Monthly Return</h3><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}><defs><radialGradient id="barGradientPositive" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FBBF24" stopOpacity={0.7}/><stop offset="100%" stopColor="#F59E0B" stopOpacity={0.4}/></radialGradient><linearGradient id="barGradientNegative" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#475569" stopOpacity={0.6}/><stop offset="100%" stopColor="#334155" stopOpacity={0.3}/></linearGradient></defs><CartesianGrid stroke="#1e293b" strokeDasharray="1 10" strokeOpacity={0.5} /><XAxis dataKey="name" stroke="#475569" tick={{fontSize: 12}}/><YAxis stroke="#475569" tickFormatter={(tick) => `${tick}%`} tick={{fontSize: 12}} domain={monthlyDomain} /><Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(251, 191, 36, 0.1)'}}/><Bar dataKey="avgReturn">{monthlyData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.avgReturn > 0 ? 'url(#barGradientPositive)' : 'url(#barGradientNegative)'} stroke={entry.avgReturn > 0 ? '#F59E0B' : '#475569'} strokeWidth={2}/>))}</Bar></BarChart></ResponsiveContainer></div>
                      <div className="h-[300px]"><h3 className="text-xl font-semibold text-center mb-4 text-slate-300 tracking-tight">Day-of-Week Return</h3><ResponsiveContainer width="100%" height="100%"><BarChart data={dayOfWeekData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}><defs><radialGradient id="barGradientPositive" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FBBF24" stopOpacity={0.7}/><stop offset="100%" stopColor="#F59E0B" stopOpacity={0.4}/></radialGradient><linearGradient id="barGradientNegative" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#475569" stopOpacity={0.6}/><stop offset="100%" stopColor="#334155" stopOpacity={0.3}/></linearGradient></defs><CartesianGrid stroke="#1e293b" strokeDasharray="1 10" strokeOpacity={0.5} /><XAxis dataKey="name" stroke="#475569" tick={{fontSize: 12}}/><YAxis stroke="#475569" tickFormatter={(tick) => `${tick.toFixed(3)}%`} tick={{fontSize: 12}} domain={dayOfWeekDomain} /><Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(251, 191, 36, 0.1)'}}/><Bar dataKey="avgReturn">{dayOfWeekData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.avgReturn > 0 ? 'url(#barGradientPositive)' : 'url(#barGradientNegative)'} stroke={entry.avgReturn > 0 ? '#F59E0B' : '#475569'} strokeWidth={2}/>))}</Bar></BarChart></ResponsiveContainer></div>
                  </div>
              </div>
          )}
      </div>
    </>
  )
}

// --- In-Season Scanner Page Components & Logic ---

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
    
    if (sortConfig !== null) {
      filtered.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return filtered;
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

  const SortableHeader = ({ children, name }) => {
    const isSorted = sortConfig.key === name;
    return (
        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-blue-200 uppercase tracking-wider cursor-pointer" onClick={() => requestSort(name)}>
            <div className="flex items-center">
                {children}
                {isSorted && (sortConfig.direction === 'ascending' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />)}
            </div>
        </th>
    )
  }

  return (
    <>
      <h1 className="text-5xl font-bold text-slate-100 mb-2 tracking-tight text-center" style={{textShadow: '0 0 15px rgba(56, 189, 248, 0.5)'}}>In-Season Scanner</h1>
      <p className="text-blue-200/70 text-lg mb-12 text-center">Find Tickers with Strong Seasonal Winds</p>

      <form onSubmit={handleSubmit} className="w-full max-w-5xl bg-slate-900/50 backdrop-blur-sm border border-blue-300/10 rounded-lg p-6 control-panel relative mb-8 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
          {/* Controls */}
          <div className="flex flex-col gap-2">
            <label htmlFor="assetClass" className="text-sm text-blue-300/70">Asset Class</label>
            <div className="relative">
                <select id="assetClass" value={assetClass} onChange={e => setAssetClass(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-center text-white focus:ring-2 focus:ring-amber-500 focus:outline-none appearance-none">
                    <option value="Stocks">Stocks</option>
                    <option value="ETFs">ETFs</option>
                </select>
                <ChevronDown className="w-5 h-5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="winRate" className="text-sm text-blue-300/70">Win Rate Threshold</label>
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-md">
                <input id="winRate" type="number" value={winRateThreshold} onChange={e => setWinRateThreshold(e.target.value)} className="w-full bg-transparent p-2 text-center text-white focus:outline-none" />
                <span className="text-slate-400 pr-3">%</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="forwardMonths" className="text-sm text-blue-300/70">Forward Period</label>
            <div className="relative">
                <select id="forwardMonths" value={forwardMonths} onChange={e => setForwardMonths(parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-center text-white focus:ring-2 focus:ring-amber-500 focus:outline-none appearance-none">
                    <option value="1">1 Month</option>
                    <option value="2">2 Months</option>
                    <option value="3">3 Months</option>
                </select>
                <ChevronDown className="w-5 h-5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="seasonalityYears" className="text-sm text-blue-300/70">Seasonality Period</label>
            <div className="relative">
                <select id="seasonalityYears" value={seasonalityYears} onChange={e => setSeasonalityYears(parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-md py-2 px-3 text-center text-white focus:ring-2 focus:ring-amber-500 focus:outline-none appearance-none">
                    <option value="5">Last 5 Years</option>
                    <option value="10">Last 10 Years</option>
                    <option value="20">Last 20 Years</option>
                </select>
                <ChevronDown className="w-5 h-5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <button 
              type="submit" disabled={scannerIsLoading} 
              className="bg-amber-500 hover:bg-amber-400 text-amber-900 font-bold py-2 px-6 transition-all duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed rounded-full shadow-[0_0_20px_rgba(251,191,36,0.5)] flex items-center justify-center gap-2"
          >
              <Zap size={18}/>
              {scannerIsLoading ? 'SCANNING...' : 'SCAN'}
          </button>
        </div>
      </form>

      {/* Results */}
      <div className="w-full max-w-6xl mx-auto">
        {scannerIsLoading && <LoadingSpinner text="Loading Pre-calculated Data..."/>}
        {!scannerIsLoading && scannerError && <div className="text-center py-12 text-red-400">{scannerError}</div>}
        {!scannerIsLoading && !scannerError && scanCompleted && (
          <motion.div initial={{opacity: 0}} animate={{opacity: 1}}>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-slate-200 tracking-tight">Scan Results</h2>
                <div className="flex items-center gap-2">
                    <label htmlFor="strict-toggle" className="text-sm text-blue-300/70">Strict Years</label>
                    <button id="strict-toggle" type="button" onClick={() => setStrictYears(!strictYears)} className={`relative inline-flex items-center h-8 rounded-full w-14 transition-colors ${strictYears ? 'bg-amber-500' : 'bg-slate-700'}`}>
                        <span className={`inline-block w-6 h-6 transform bg-white rounded-full transition-transform ${strictYears ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>
            {displayedResults.length > 0 ? (
              <div className="overflow-x-auto bg-slate-900/50 backdrop-blur-sm border border-blue-300/10 rounded-lg">
                <table className="min-w-full divide-y divide-slate-700">
                    <thead className="bg-slate-800/50">
                        <tr>
                            <SortableHeader name="ticker">Ticker</SortableHeader>
                            <SortableHeader name="winRate">Win Rate</SortableHeader>
                            <SortableHeader name="avgReturn">Avg Return</SortableHeader>
                            <SortableHeader name="maxProfit">Max Profit</SortableHeader>
                            <SortableHeader name="maxLoss">Max Loss</SortableHeader>
                            <SortableHeader name="yearsOfData">Years</SortableHeader>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {displayedResults.map((item) => (
                            <tr key={item.ticker} className="hover:bg-slate-800/40 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-amber-400 cursor-pointer hover:underline" onClick={() => onTickerClick(item.ticker)}>
                                    {item.ticker}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{item.winRate.toFixed(1)}%</td>
                                <td className={`px-6 py-4 whitespace-nowrap text-sm ${item.avgReturn > 0 ? 'text-green-400' : 'text-red-400'}`}>{item.avgReturn.toFixed(2)}%</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-400">{item.maxProfit.toFixed(2)}%</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-400">{item.maxLoss.toFixed(2)}%</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{item.yearsOfData}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <ShieldCheck size={48} className="mx-auto mb-4 opacity-30"/>
                <p>No tickers met the criteria for this scan.</p>
                <p className="text-sm opacity-70">Try adjusting the thresholds or waiting for the daily scan to complete.</p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </>
  )
}


/**
 * Main application component with navigation and state management.
 */
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
          const errorData = await response.json().catch(() => ({error: "An unknown API error occurred."}));
          throw new Error(errorData.error || `Network response error (status: ${response.status})`);
      }
      
      const data = await response.json();
      if (Object.keys(data).length === 0) {
          throw new Error('No valid historical data returned for the specified range.');
      }
      
      const formattedDailyData = {};
      const timestamps = [];
      for (const dateStr in data) {
          formattedDailyData[dateStr] = { 'Close': data[dateStr].Close };
          timestamps.push(new Date(dateStr).getTime() / 1000);
      }
      
      const firstActualYear = new Date(timestamps[0] * 1000).getFullYear();
      
      const dataByYear = {};
      for (const dateStr in formattedDailyData) {
        const year = new Date(dateStr).getFullYear();
        if (!dataByYear[year]) dataByYear[year] = [];
        dataByYear[year].push({ date: new Date(dateStr), price: formattedDailyData[dateStr]['Close'] });
      }
      for (const year in dataByYear) { dataByYear[year].sort((a, b) => a.date - b.date); }
      setPriceDataByYear(dataByYear);

      const calculatedData = calculateTradingDaySeasonality(formattedDailyData, startYearNum, endYearNum);
      if (calculatedData === null || calculatedData.chartData.length === 0) throw new Error("Calculation failed: Could not process seasonality from data.");
      
      setSeasonalityData(calculatedData.chartData);
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

  // --- Logic for InSeasonPage ---
  const handleScan = () => {
    if (!allScanData) {
        setScannerError("Scan data is not loaded yet. Please wait a moment or check the console for errors.");
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
    setPage('seasonality');
    setRefetchTrigger(prev => prev + 1);
  };

  // --- Navigation ---
  const NavButton = ({ targetPage, children }) => (
    <button 
      onClick={() => setPage(targetPage)}
      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        page === targetPage 
        ? 'bg-slate-700 text-white' 
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {children}
    </button>
  );

  return (
    <>
	<Analytics />
	<SpeedInsights />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700&display=swap');
        body { font-family: 'Exo 2', sans-serif; background-color: #010409; color: #E5E7EB; }
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        .starfield { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: radial-gradient(1px 1px at 20% 30%, #93c5fd, transparent), radial-gradient(1px 1px at 80% 70%, #93c5fd, transparent), radial-gradient(1px 1px at 50% 50%, #e0f2fe, transparent), radial-gradient(2px 2px at 90% 10%, #e0f2fe, transparent), radial-gradient(2px 2px at 10% 90%, #93c5fd, transparent), radial-gradient(1px 1px at 40% 15%, #e0f2fe, transparent), radial-gradient(1px 1px at 95% 85%, #93c5fd, transparent), radial-gradient(2px 2px at 60% 60%, #e0f2fe, transparent), radial-gradient(1px 1px at 75% 45%, #93c5fd, transparent); background-size: 100% 100%; animation: star-move 120s linear infinite; }
        @keyframes star-move { from { background-position: 0 0; } to { background-position: -10000px 5000px; } }
        .control-panel::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(to bottom, rgba(14, 116, 144, 0.1), transparent); border-radius: 0.5rem; pointer-events: none; }
      `}</style>
      <div className="relative bg-[#010409] min-h-screen overflow-hidden">
        <div className="starfield"></div>
        <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 relative z-10">
          <nav className="flex justify-center mb-12">
            <div className="flex space-x-4 bg-slate-900/50 backdrop-blur-sm border border-blue-300/10 rounded-lg p-2">
              <NavButton targetPage="seasonality">Seasonality</NavButton>
              <NavButton targetPage="in-season">In-Season Scanner</NavButton>
            </div>
          </nav>
          
          <main>
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
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

        </div>
      </div>
    </>
  );
}

export default App;








