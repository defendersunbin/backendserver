// 크롤링시 필요한 라이브러리 불러오기
const { default: axios } = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const moment = require('moment');
const readlineSync = require('readline-sync');
const ProgressBar = require('progress');

// 페이지 url 형식에 맞게 바꾸어 주는 함수 만들기
// 입력된 수를 1, 11, 21, 31 ...만들어 주는 함수
function makePgNum(num) {
  if (num === 1) {
    return num;
  } else if (num === 0) {
    return num + 1;
  } else {
    return num + 9 * (num - 1);
  }
}

// 크롤링할 url 생성하는 함수 만들기(검색어, 크롤링 시작 페이지, 크롤링 종료 페이지)
function makeUrl(search, start_pg, end_pg) {
  const urls = [];
  // 현재 시간 기준 7일 이전 날짜 계산
  const target_date = moment().subtract(7, 'days').format('YYYY.MM.DD');
  const now = moment().format('YYYY.MM.DD');

  for (let i = start_pg; i <= end_pg; i++) {
    const page = makePgNum(i);
    const url = `https://search.naver.com/search.naver?where=news&sm=tab_pge&query=${search}&sort=0&photo=0&field=0&pd=3&ds=${target_date}&de=${now}&start=${page}`;
    urls.push(url);
  }

  console.log('생성url: ', urls);
  return urls;
}

// html에서 원하는 속성 추출하는 함수 만들기 (기사, 추출하려는 속성값)
function news_attrs_crawler(articles, attrs) {
  const attrs_content = [];
  for (let i = 0; i < articles.length; i++) {
    attrs_content.push(articles[i].attribs[attrs]);
  }
  return attrs_content;
}

// html생성해서 기사크롤링하는 함수 만들기(url): 링크를 반환
async function articles_crawler(url) {
  try {
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);
    const url_naver = $('div.group_news > ul.list_news > li div.news_area > div.news_info > div.info_group > a.info');
    const urls = news_attrs_crawler(url_naver, 'href');
    return urls;
  } catch (error) {
    console.error(error);
    return [];
  }
}

// 뉴스 크롤링 시작
(async () => {
  // 검색어 입력
  const search = readlineSync.question('검색할 키워드를 입력해주세요:');
  // 검색 시작할 페이지 입력
  const start_pg = parseInt(readlineSync.question('\n크롤링할 시작 페이지를 입력해주세요. ex)1(숫자만입력):'));  // ex)1 =1페이지,2=2페이지...
  console.log('\n크롤링할 시작 페이지: ', start_pg, '페이지');
  // 검색 종료할 페이지 입력
  const end_pg = parseInt(readlineSync.question('\n크롤링할 종료 페이지를 입력해주세요. ex)1(숫자만입력):'));  // ex)1 =1페이지,2=2페이지...
  console.log('\n크롤링할 종료 페이지: ', end_pg, '페이지');

  // naver url 생성
  const urls = makeUrl(search, start_pg, end_pg);

  // 뉴스 크롤러 실행
  const news_titles = [];
  const news_urls = [];
  const news_contents = [];
  const news_dates = [];

  const bar = new ProgressBar('크롤링 진행중 [:bar] :percent', { total: urls.length });

  for (let i = 0; i < urls.length; i++) {
    const newsUrl = await articles_crawler(urls[i]);
    news_urls.push(...newsUrl);
    bar.tick();
  }

  // 뉴스 내용 크롤링
  const final_urls = news_urls.filter(url => url.includes('news.naver.com'));

  for (let i = 0; i < final_urls.length; i++) {
    try {
      const response = await axios.get(final_urls[i]);
      const html = response.data;
      const $ = cheerio.load(html);

      // 뉴스 제목 가져오기
      let title = $('#ct > div.media_end_head.go_trans > div.media_end_head_title > h2');
      if (title === null) {
        title = $('#content > div.end_ct > div > h2');
      }

      // 뉴스 본문 가져오기
      let content = $('div#dic_area');
      if (content.length === 0) {
        content = $('#articeBody');
      }

      // 기사 텍스트만 가져오기
      // list합치기
      content = content.text().replace(/\n/g, '').replace(/\s\s+/g, ' ');

      news_titles.push(title.text());
      news_contents.push(content);

      let news_date = $('div#ct> div.media_end_head.go_trans > div.media_end_head_info.nv_notrans > div.media_end_head_info_datestamp > div > span').attr('data-date-time');
      if (news_date === undefined) {
        const news_date_em = $('#content > div.end_ct > div > div.article_info > span > em');
        news_date = news_date_em.text().replace(/\n/g, '').replace(/\s\s+/g, ' ');
      }
      news_dates.push(news_date);
    } catch (error) {
      console.error(error);
    }
  }

  console.log('검색된 기사 갯수: 총 ', (end_pg + 1 - start_pg) * 10, '개');
  console.log('\n[뉴스 제목]');
  console.log(news_titles);
  console.log('\n[뉴스 링크]');
  console.log(final_urls);
  console.log('\n[뉴스 내용]');
  console.log(news_contents);

  console.log('news_title: ', news_titles.length);
  console.log('news_url: ', final_urls.length);
  console.log('news_contents: ', news_contents.length);
  console.log('news_dates: ', news_dates.length);

  // 데이터 프레임으로 만들기
  const newsData = [];
  for (let i = 0; i < news_titles.length; i++) {
    newsData.push({ date: news_dates[i], title: news_titles[i], link: final_urls[i], content: news_contents[i] });
  }

  // 중복 행 지우기
  const uniqueNewsData = [];
  const uniqueUrls = new Set();
  for (let i = 0; i < newsData.length; i++) {
    const { link } = newsData[i];
    if (!uniqueUrls.has(link)) {
      uniqueUrls.add(link);
      uniqueNewsData.push(newsData[i]);
    }
  }

  console.log('중복 제거 후 행 개수: ', uniqueNewsData.length);

  // 데이터 프레임 저장
  const now = moment().format('YYYYMMDDHHmmss');
  const sortedNewsData = uniqueNewsData.sort((a, b) => moment(b.date).diff(moment(a.date)));
  const csvData = sortedNewsData.map(news => `${news.date},${news.title},${news.link},${news.content}`).join('\n');
  fs.writeFileSync(`csv/sk하이닉스_${now}.csv`, csvData, 'utf-8');

})();
