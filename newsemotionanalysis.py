# 크롤링시 필요한 라이브러리 불러오기
import sys
import json
from bs4 import BeautifulSoup
import requests
import re
import datetime
from tqdm import tqdm
import pandas as pd
from konlpy.tag import Hannanum
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# 페이지 입력 (1 페이지당 기사 10개 이하)
def makePgNum(num):
    if num == 1:
        return num
    elif num == 0:
        return num + 1
    else:
        return num + 9 * (num - 1)


# search : 검색어, pd=4 : 최근 1일, start_page : 몇 페이지
def makeUrl(search, start_pg, end_pg):
    if start_pg == end_pg:
        start_page = makePgNum(start_pg)
        url = "https://search.naver.com/search.naver?where=news&sm=tab_pge&query=" + search +"&start=" + str(
            start_page)

        return url
    else:
        urls = []
        for i in range(start_pg, end_pg + 1):
            page = makePgNum(i)

            url = "https://search.naver.com/search.naver?where=news&sm=tab_pge&query=" + search +"&pd=4"+"&start=" + str(page)
            urls.append(url)
        return urls

    # html에서 원하는 속성 추출하는 함수 만들기 (기사, 추출하려는 속성값)

# 기사 내용 크롤링 함수
def news_attrs_crawler(articles, attrs):
    attrs_content = []
    for i in articles:
        attrs_content.append(i.attrs[attrs])
    return attrs_content


# ConnectionError방지
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/98.0.4758.102"}

# html생성해서 기사크롤링하는 함수 만들기(url): 링크를 반환
def articles_crawler(url):
    # html 불러오기
    original_html = requests.get(i, headers=headers)
    html = BeautifulSoup(original_html.text, "html.parser")

    url_naver = html.select(
        "div.group_news > ul.list_news > li div.news_area > div.news_info > div.info_group > a.info")
    url = news_attrs_crawler(url_naver, 'href')
    return url

#####뉴스크롤링 시작#####

# 검색어 입력
search = sys.argv[1] if len(sys.argv) > 1 else input("검색 키워드 입력 : ")
# 검색 시작할 페이지 입력
page = 1
# 검색 종료할 페이지 입력
page2 = 10

searches = ['삼성전자','LG에너지솔루션','SK하이닉스','삼성바이오로직스','POSCO홀딩스',"LG화학","삼성SDI","현대차","NAVER"]

# naver url 생성
url = makeUrl(search, page, page2)

# 뉴스 크롤러 실행
news_titles = []
news_url = []
news_contents = []
news_dates = []

for i in url:
    url = articles_crawler(url)
    news_url.append(url)


# 제목, 링크, 내용 1차원 리스트로 꺼내는 함수 생성
def makeList(newlist, content):
    for i in content:
        for j in i:
            newlist.append(j)
    return newlist


# 제목, 링크, 내용 담을 리스트 생성
news_url_1 = []

# 1차원 리스트로 만들기(내용 제외)
makeList(news_url_1, news_url)

# NAVER 뉴스만 남기기
final_urls = []
for i in tqdm(range(len(news_url_1))):
    if "news.naver.com" in news_url_1[i]:
        final_urls.append(news_url_1[i])
    else:
        pass

# 뉴스 내용 크롤링
for i in tqdm(final_urls):
    # 각 기사 html get하기
    news = requests.get(i, headers=headers)
    news_html = BeautifulSoup(news.text, "html.parser")

    # 뉴스 제목 가져오기
    title = news_html.select_one("#ct > div.media_end_head.go_trans > div.media_end_head_title > h2")
    if title == None:
        title = news_html.select_one("#content > div.end_ct > div > h2")
    # ------------------------------------------------------------------------------------------------------------------
    # 뉴스 본문 가져오기 (일단 구현은 해놓음 but 일단 기사 제목 수준에서 진행)
    content = news_html.select("div#dic_area")
    if content == []:
        content = news_html.select("#articeBody")
    content = ''.join(str(content))

    # html태그제거 및 텍스트 다듬기
    pattern1 = '<[^>]*>'
    title = re.sub(pattern=pattern1, repl='', string=str(title))
    content = re.sub(pattern=pattern1, repl='', string=content)
    pattern2 = """[\n\n\n\n\n// flash 오류를 우회하기 위한 함수 추가\nfunction _flash_removeCallback() {}"""
    content = content.replace(pattern2, '')

    news_titles.append(title)
    news_contents.append(content)

    try:
        html_date = news_html.select_one(
            "div#ct> div.media_end_head.go_trans > div.media_end_head_info.nv_notrans > div.media_end_head_info_datestamp > div > span")
        news_date = html_date.attrs['data-date-time']
    except AttributeError:
        news_date = news_html.select_one("#content > div.end_ct > div > div.article_info > span > em")
        news_date = re.sub(pattern=pattern1, repl='', string=str(news_date))
        news_date = news_date[0:10]
    # 날짜 가져오기
    news_dates.append(news_date)

print("\n[뉴스 제목]")
print(news_titles)
print("\n[뉴스 링크]")
print(final_urls)
print("\n[뉴스 내용]")
print(news_contents)
print("\n[뉴스 날짜]")
print(news_dates)

print('news_title: ', len(news_titles))
print('news_url: ', len(final_urls))
print('news_contents: ', len(news_contents))
print('news_dates: ', len(news_dates))

news_df = pd.DataFrame({'date': news_dates, 'title': news_titles, 'content' : news_contents})
news_df

from konlpy.tag import Hannanum  # Hannanum 형태소 분석기 불러오기
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

df = news_df

# KoELECTRA 모델 로드
model_name = "hyunwoongko/kobart"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

# 형태소 분석 함수
hannanum = Hannanum()  # Hannanum 형태소 분석기 객체 생성
def tokenize(text):
    return hannanum.morphs(text)

# title 열에 대해 형태소 분석 적용

df['title'] = df['title'].astype(str).apply(tokenize)
# for i in range(df.shape[0]):
#     df.iloc[i,1] = df.iloc[i,1].apply(tokenize)


# 감성 분석을 위한 전처리 함수
def preprocess(text):
    inputs = tokenizer(text, padding=True, truncation=True, return_tensors="pt")
    inputs.to(device)
    return inputs

# 예측 함수
def predict(inputs):
    outputs = model(**inputs)
    logits = outputs.logits
    probs = logits.softmax(dim=-1)
    return probs[0].detach().cpu().numpy()

# title을 예측해서 수치화시켜 sentiment으로 저장. 즉, title를 수치화 시킨 것이 sentiment
df['sentiment'] = df['title'].apply(lambda x: predict(preprocess(' '.join(x))))

# 0.5 기준으로 하면 부정확하긴 함... 정확도를 높이려면 이 부분 건들면 좋을 듯 또는 중립을 포함시키는 것도 해봐야 할 듯
def convert_sentiment(probs):
    if probs[0] < 0.5:
        return 0
    elif probs[0]>= 0.5:
        return 1
#     else:
#         return '중립'

# train할 label은 제목을 읽고 내가 직접 라벨링
# test할 label은 0.5를 기준으로 sentiment가 0.5보다 크면 1, 작으면 0으로 기준 세움
df['label'] = df['sentiment'].apply(convert_sentiment)
df['sentiment'] = df['sentiment'].apply(lambda x: x[0]).tolist()
df=round(df,2)

senti_avg = df['sentiment'].mean()

print(f"모든 뉴스에 대한 평균 감성 점수 값: {df['sentiment'].mean()}")
if df['sentiment'].mean() >= 0.5:
    print("주가의 상승 예측");
else:
    print("주가의 하락 예측");

data_to_send = {
    'keywords': searches,
    'senti_avg': senti_avg,
    'news_title': news_titles,
    'news_url': final_urls,
    'news_contents': news_contents,
    'news_dates': news_dates,
    'prediction': '주가의 상승 예측' if senti_avg >= 0.5 else '주가의 하락 예측'
}

print(json.dumps(data_to_send))

