const readline = require('readline');
const axios = require('axios');
const cheerio = require('cheerio');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('종목 코드를 입력하세요: ', async (stockCode) => {
    rl.question('종목 이름을 입력하세요: ', async (stockName) => {
        const url = `https://finance.naver.com/item/main.nhn?code=${stockCode}`;

        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);

            const currentPrice = $('#chart_area > div.rate_info > div > p.no_today > em').text();
            const change = $('#chart_area > div.rate_info > div > p.no_exday > em > span.blind').text();
            const changePercentage = $('#chart_area > div.rate_info > div > p.no_exday > em > span.blind').next().text();

            console.log(`${stockName} 현재가: ${currentPrice}`);
            console.log(`전일대비: ${change} (${changePercentage})`);
        } catch (error) {
            console.error('주식 데이터를 가져오는 중 오류 발생:', error);
        }

        rl.close();
    });
});
