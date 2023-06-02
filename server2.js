const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.get('/stock-price', async (req, res) => {
  try {
    const { symbol } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

    const response = await axios.get(url);
    const data = response.data;

    // Extract the latest price from the response
    const latestPrice = data.chart.result[0].meta.regularMarketPrice;

    res.json({ symbol, latestPrice });
  } catch (error) {
    console.error('Error fetching stock price:', error.message);
    res.status(500).json({ error: 'Failed to fetch stock price' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
