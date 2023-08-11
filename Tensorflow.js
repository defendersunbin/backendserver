const axios = require('axios');
const cheerio = require('cheerio');

// 검색할 종목의 코드와 이름
const stockCode = '005930'; // 삼성전자 종목 코드
const stockName = '삼성전자';

// 네이버 금융의 종목 정보 URL
const url = `https://finance.naver.com/item/main.nhn?code=${stockCode}`;

// 웹 페이지에서 종목 정보 가져오는 함수
async function fetchStockData() {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        const currentPrice = $('#chart_area > div.rate_info > div > p.no_today > em').text();
        const change = $('#chart_area > div.rate_info > div > p.no_exday > em > span.blind').text();
        const changePercentage = $('#chart_area > div.rate_info > div > p.no_exday > em > span.blind').next().text();

        console.log(`${stockName} 현재가: ${currentPrice}`);
        console.log(`전일대비: ${change} (${changePercentage})`);
    } catch (error) {
        console.error('Error fetching stock data:', error);
    }
}

fetchStockData();