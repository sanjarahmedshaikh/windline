import React, {useEffect, useMemo, useState} from 'react'
import {createRoot} from 'react-dom/client'
import './styles.css'

const fallback = {deliveryDate:'2026-01-27',decisionRule:'Latest forecast published by 23:59 UTC the day before delivery',latestForecast:null,metrics:{points:0,mae:null,rmse:null,bias:null,mape:null},points:[],source:{actuals:'FUELHH',forecasts:'WINDFOR'}}

function fmt(value, digits=0){return value == null ? '—' : `${Number(value).toLocaleString(undefined,{maximumFractionDigits:digits})} MW`}
function LineChart({points}){
  const width=760,height=260,pad=32,max=Math.max(...points.flatMap(p=>[p.actual,p.forecast]),1), step=(width-pad*2)/Math.max(points.length-1,1)
  const path=(key)=>points.map((p,i)=>`${i?'L':'M'} ${pad+i*step} ${height-pad-(p[key]/max)*(height-pad*2)}`).join(' ')
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Forecast and actual wind generation by half hour">
    <line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} className="axis"/><path d={path('actual')} className="line actual"/><path d={path('forecast')} className="line forecast"/>
    <text x={pad} y={height-8}>00:00</text><text x={width-pad-34} y={height-8}>24:00</text><text x={pad} y={18}>{Math.round(max)} MW</text>
  </svg>
}
function App(){
  const [date,setDate]=useState('2026-01-27'), [data,setData]=useState(fallback), [loading,setLoading]=useState(false), [error,setError]=useState('')
  useEffect(()=>{setLoading(true);setError('');fetch(`/api/analysis?date=${date}`).then(r=>r.ok?r.json():r.json().then(e=>Promise.reject(new Error(e.detail)))).then(setData).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[date])
  const last = useMemo(()=>data.points.at(-1),[data.points])
  return <main>
    <nav><a className="brand" href="/">windline<span> / January 2026</span></a><span className="status">Elexon national wind</span></nav>
    <section className="hero"><div><h1>Know the wind before you buy.</h1><p className="lede">A clear view of the latest renewable forecast, its publication timing, and the error you should price into tomorrow’s power purchase.</p></div><div className="date-picker"><label htmlFor="delivery">Delivery date</label><input id="delivery" type="date" min="2026-01-01" max="2026-01-31" value={date} onChange={e=>setDate(e.target.value)}/><small>January 2026 only</small></div></section>
    {error && <p className="notice">{error}. Try another January 2026 date.</p>}
    <section className="signal-grid"><article className="primary-card"><div className="card-top"><div><h2>{fmt(data.latestForecast?.generation)}</h2><p className="label">Latest eligible forecast</p></div><span className="pill">{loading?'Refreshing':'Ready to use'}</span></div><p className="muted">{data.latestForecast ? `For ${new Date(data.latestForecast.startTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} delivery · published ${new Date(data.latestForecast.publishTime).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}` : 'Live data appears here when the API responds.'}</p></article><article className="context-card"><p>{data.decisionRule}</p><p className="label">Decision rule</p><a href="https://developer.data.elexon.co.uk/" target="_blank" rel="noreferrer">View source documentation ↗</a></article></section>
    <section className="analysis"><div className="section-head"><div><h2>How much uncertainty is in the signal?</h2><p className="label">Forecast quality</p></div><span className="coverage">{data.metrics.points || 0} matched half-hours</span></div><div className="metric-grid"><Metric label="Mean absolute error" value={fmt(data.metrics.mae,1)} note="typical miss"/><Metric label="RMSE" value={fmt(data.metrics.rmse,1)} note="penalises large misses"/><Metric label="Bias" value={fmt(data.metrics.bias,1)} note={data.metrics.bias>0?'forecast runs high':'forecast runs low or is balanced'}/><Metric label="MAPE" value={data.metrics.mape==null?'—':`${data.metrics.mape}%`} note="percentage miss"/></div><div className="chart-wrap"><div className="chart-title"><h3>Forecast versus actual</h3><div><span className="legend forecast-dot">Forecast</span><span className="legend actual-dot">Actual</span></div></div>{data.points.length ? <LineChart points={data.points}/> : <div className="empty">No matched points returned for this date.</div>}</div></section>
    <section className="footer-note"><div><h2>One number is not enough.</h2><p className="label">Built for a fast decision</p></div><p>Use the latest eligible forecast for the baseline. Use the measured error profile to understand how much additional procurement risk remains.</p></section>
    <footer>Windline pilot · Data: Elexon Insights API · Actuals {data.source.actuals} · Forecasts {data.source.forecasts}{last && ` · Last delivery point ${fmt(last.actual)}`}</footer>
  </main>
}
function Metric({label,value,note}){return <div className="metric"><p className="label">{label}</p><strong>{value}</strong><span>{note}</span></div>}
createRoot(document.getElementById('root')).render(<App/>)
