const API = 'https://data.elexon.co.uk/bmrs/api/v1'

const iso = value => new Date(value).toISOString()
const pick = (row, ...keys) => keys.map(key => row[key]).find(value => value !== undefined)
const normalise = (rows, actual) => rows.filter(row => pick(row, 'startTime', 'start_time') && pick(row, 'generation', 'Generation') != null && (!actual || String(pick(row, 'fuelType', 'fuel_type') || '').toUpperCase() === 'WIND')).map(row => ({startTime: pick(row, 'startTime', 'start_time'), publishTime: pick(row, 'publishTime', 'publish_time'), generation: Number(pick(row, 'generation', 'Generation'))}))

async function getJson(path, params) {
  const url = new URL(`${API}/${path}`)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Elexon returned ${response.status}`)
  return response.json()
}

function accuracy(points) {
  const errors = points.map(point => point.forecast - point.actual)
  const absolute = errors.map(Math.abs)
  const positive = points.filter(point => point.actual > 0)
  return {
    points: points.length,
    mae: points.length ? Number((absolute.reduce((a, b) => a + b, 0) / points.length).toFixed(1)) : null,
    rmse: points.length ? Number(Math.sqrt(errors.reduce((a, b) => a + b * b, 0) / points.length).toFixed(1)) : null,
    bias: points.length ? Number((errors.reduce((a, b) => a + b, 0) / points.length).toFixed(1)) : null,
    mape: positive.length ? Number((positive.reduce((total, point) => total + Math.abs(point.forecast - point.actual) / point.actual, 0) / positive.length * 100).toFixed(1)) : null,
  }
}

export default async function handler(request, response) {
  try {
    const date = request.query.date || '2026-01-27'
    const delivery = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(delivery.getTime()) || delivery < new Date('2026-01-01T00:00:00Z') || delivery >= new Date('2026-02-01T00:00:00Z')) {
      return response.status(400).json({ detail: 'Choose a delivery date in January 2026' })
    }
    const dayBefore = new Date(delivery.getTime() - 86400000)
    const nextDay = new Date(delivery.getTime() + 86400000)
    const [actualPayload, forecastPayload] = await Promise.all([
      getJson('datasets/FUELHH/stream', {settlementDateFrom: dayBefore.toISOString().slice(0, 10), settlementDateTo: nextDay.toISOString().slice(0, 10)}),
      getJson('forecast/generation/wind/history', {from: iso(delivery), to: iso(nextDay), publishTime: new Date(delivery.getTime() - 1000).toISOString()}),
    ])
    const actuals = normalise(actualPayload, true).filter(row => row.startTime.startsWith(date))
    const forecasts = normalise(forecastPayload.data || forecastPayload, false).filter(row => row.startTime.startsWith(date) && new Date(row.publishTime) < delivery)
    const actualByStart = Object.fromEntries(actuals.map(row => [row.startTime, row]))
    const selected = {}
    forecasts.forEach(row => { if (!selected[row.startTime] || new Date(selected[row.startTime].publishTime) < new Date(row.publishTime)) selected[row.startTime] = row })
    const points = Object.values(selected).filter(row => actualByStart[row.startTime]).sort((a, b) => a.startTime.localeCompare(b.startTime)).map(row => ({startTime: row.startTime, forecast: row.generation, actual: actualByStart[row.startTime].generation, publishTime: row.publishTime}))
    return response.status(200).json({deliveryDate: date, decisionRule: 'Latest forecast published by 23:59 UTC the day before delivery', latestForecast: Object.values(selected).sort((a, b) => a.startTime.localeCompare(b.startTime)).at(-1) || null, metrics: accuracy(points), points, source: {actuals: 'FUELHH', forecasts: 'WINDFOR'}})
  } catch (error) {
    return response.status(502).json({ detail: error.message })
  }
}
