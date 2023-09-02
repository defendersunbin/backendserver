const express = require('express')
const ejs = require('ejs')
const app = express()
// 환경변수에서 온 PORT 값을 받기
const port = 3000;
const bodyParser = require('body-parser')
//새로 추가
const path = require('path');
const fs = require('fs');
const yahooFinance = require('yahoo-finance');
const axios = require('axios');
const cheerio = require('cheerio');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const secretKey = 'tIMEiSwATCH2023!!';
const secretKeyRefreshToken = 'timEWatch2023@@';
var session = require('express-session')
require('dotenv').config()

const mysql = require('mysql2')
const {httpOnly} = require("express-session/session/cookie");
const connection = mysql.createConnection(process.env.DATABASE_URL)
console.log('Connected to PlanetScale!')

connection.query("SET time_zone='Asia/Seoul'");

app.set('view engine','ejs')
app.set('views','./views')

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname+'/public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'test', cookie: { maxAge: 60000 }, resave:true, saveUninitialized:true, }));

app.use((req, res, next) => {

    res.locals.user_id = "";
    res.locals.name = "";

    if(req.session.member){
        res.locals.user_id = req.session.member.user_id
        res.locals.name = req.session.member.name
    }
    next()
})

app.get('/', (req, res) => {
    console.log(req.session.member);

    res.json({view: 'index'})   // JSON response
})

app.get('/profile', (req, res) => {
    res.json({view: 'profile'})
})

app.get('/contact', (req, res) => {
    res.json({view: 'contact'})
})

app.post('/contactProc', (req, res) => {
    const name = req.body.name;
    const phone = req.body.phone;
    const email = req.body.email;
    const memo = req.body.memo;

    var sql = `insert into contact(name,phone,email,memo,regdate)
   values(?,?,?,?,now() )`

    var values = [name,phone,email,memo];

    connection.query(sql, values, function (err, result){
        if(err) throw err;
        console.log('자료 1개를 삽입하였습니다.');
        // Send a JSON response instead of an HTML/JavaScript string
        res.json({
            message: '문의사항이 등록되었습니다.',
            redirectUrl: '/'
        });

    })
})

app.get('/contactDelete', (req, res) => {

    var idx = req.query.idx
    var sql = `delete from contact where idx='${idx}' `
    connection.query(sql,function(err,result){
        if(err) throw err;

        // Send a JSON response instead of an HTML/JavaScript string
        res.json({
            message: '삭제되었습니다.',
            redirectUrl:'/contactList'
        });

    })
})

app.get('/contactList', (req,res)=>{

    var sql=`select * from contact order by idx desc `

    connection.query(sql,function(err,result){
        if(err) throw err;

        // Send the results as a JSON object instead of rendering a view.
        // The lists property will contain the query results.
        res.json({
            lists:result
        });

    })
})


app.get('/login', (req, res) => {
    // 이미 로그인된 경우 메인 페이지로 리다이렉트
    if (req.session.member) {
        return res.json({redirect: '/'});
    }

    // 아니면 로그인 페이지 표시
    res.json({view: 'login'})
});

app.post('/loginProc', async (req, res) => {
    const user_id = req.body.user_id;
    const enteredPassword = req.body.pw;

    var sql = `SELECT * FROM member WHERE user_id = ?`;
    var values = [user_id];

    connection.query(sql, values, async function (err, result) {
        if (err) throw err;

        if (result.length == 0) {
            return res.json({
                message: '존재하지 않는 아이디입니다.',
                redirectUrl:'/login'
            });
        } else {
            const storedHash = result[0].pw;
            const passwordMatches = await bcrypt.compare(enteredPassword, storedHash);

            if (passwordMatches) {
                // Access Token
                const accessToken = jwt.sign({ user_id }, secretKey, { expiresIn: '1h' });

                // Refresh Token
                const refreshToken = jwt.sign({ user_id }, secretKeyRefreshToken, { expiresIn: '1d' });

                // Store tokens in the database
                var tokenSql = `UPDATE member SET access_token=?, refresh_token=? WHERE user_id=?`;
                var tokenValues=[accessToken , refreshToken ,user_id];

                // Store the member info temporarily
                let memberInfoTemp=result[0];

                connection.query(tokenSql ,tokenValues ,(err,result)=>{
                    if(err){
                        console.log("Failed to store tokens in the database");
                        throw err;
                    }
                    console.log("Tokens stored successfully");

                    res.cookie('access_token', accessToken , { httpOnly: true });
                    res.cookie('refresh_token', refreshToken , { httpOnly: true });

                    /* 사용자 정보를 JSON 형태로 응답 */
                    const responseBody={
                        "user_id":memberInfoTemp.user_id,
                        "pw":memberInfoTemp.pw,
                        "name":memberInfoTemp.name,
                        "message":'로그인 되었습니다.',
                        "redirectUrl":'/'
                    };

                    return  res.json(responseBody);

                    // Use the temporarily saved member info here.
                    req.session.member=memberInfoTemp;

                });
            } else{
                return  res.json({
                    message:'비밀번호가 일치하지 않습니다.',
                    redirectUrl:'/login'
                });
            }
        }

    });
});


app.post('/token', (req,res)=>{
    const refreshToken=req.cookies.refresh_token;

    if(!refreshToken){
        return res.sendStatus(401); // Unauthorized
    }

    jwt.verify(refreshToken,
        secretKeyRefreshToken,
        (err,user)=>{
            if(err){
                return res.sendStatus(403); // Forbidden
            }

            const accessToken=jwt.sign({user_id:user.user_id},secretKey,{expiresIn:'1h'});
            const newRefreshToken=jwt.sign({user_id:user.user_id},secretKeyRefreshToken,{expiresIn:'1d'});

            res.cookie('access_token',accessToken ,{httpOnly:true});
            res.cookie('refresh_token',newRefreshToken ,{httpOnly:true});

            return res.json({access_token:accessToken});
        });
});

app.get('/loginedit', (req, res) => {
    res.json({view: 'loginedit'});
})

app.post('/logineditProc', async (req, res) => {
    const user_id = req.body.user_id;
    const old_pw = req.body.old_pw;
    const new_pw = req.body.new_pw;

    console.log("user_id:", user_id);
    console.log("old_pw:", old_pw);
    console.log("new_pw:", new_pw);

    var sql = `SELECT * FROM member WHERE user_id = ?`
    var values = [user_id];

    connection.query(sql, values, async function (err, result) {
        if (err) throw err;

        if (result.length == 0) {
            res.json({view: 'loginedit'});
        } else {
            const storedHash = result[0].pw;
            const passwordMatches = await bcrypt.compare(old_pw, storedHash);

            if (!passwordMatches) {
                return  res.json({
                    message:'이전 비밀번호가 일치하지 않습니다.',
                    redirectUrl:'/loginedit'
                });
            } else {
                const newHash = await bcrypt.hash(new_pw, saltRounds);
                var updateSql = `UPDATE member SET pw = ? WHERE user_id = ?`;
                var updateValues=[newHash,user_id];

                connection.query(updateSql ,updateValues ,(err,result)=>{
                    if(err){
                        throw err;
                    }

                    console.log('비밀번호가 수정되었습니다.');

                    return  res.json({
                        message:'비밀번호가 수정되었습니다.',
                        redirectUrl:'/'
                    });
                });
            }
        }

    });
});

app.post('/logout', (req,res)=>{

    // If the user is not logged in redirect to main page.
    if (!req.session.member){
        return  res.json({redirect: '/'});
    }

    const user_id = req.body.user_id; // Get the user_id from request body

    if(req.session.member !== user_id) {
        return res.json({
            message:'로그아웃 요청한 사용자가 현재 세션의 사용자와 일치하지 않습니다.',
            redirectUrl:'/'
        });
    }

    req.session.destroy(err => {  // Destroy the session
        if(err) throw err;

        return  res.json({
            message:'로그아웃 되었습니다.',
            redirectUrl:'/'
        });
    });
});


const resetQuestions = [
    "첫 번째 애완동물의 이름은 무엇인가요?",
    "초등학교 시절 최고의 친구는 누구였나요?",
    "당신이 태어난 도시는 어디인가요?",
    "첫 번째 자동차의 모델은 무엇인가요?",
    "당신이 존경하는 인물은 누구인가요?",
    "당신의 어린 시절 별명은 무엇인가요?"
];

app.get('/register', (req, res) => {
    res.json({view: 'register', resetQuestions: resetQuestions})
})

app.post('/register', (req, res) => {
    const user_id = req.body.user_id;
    const pw = req.body.pw;
    const name = req.body.name;

    // 비밀번호 재설정 질문
    const resetQuestion = req.body.resetQuestion;

    console.log('Received resetQuestion:', resetQuestion); // 여기에 로그 추가

    const resetAnswer = req.body.resetAnswer; // 비밀번호 재설정 답변

    if (pw.length < 8 || pw.length > 20) {
        return res.json({
            message:'비밀번호는 최소 8자리, 최대 20자리까지 설정해주세요.',
            redirectUrl:'/register'
        });
    } else{
        var checkDuplicateSql=`SELECT * FROM member WHERE user_id=?`;
        var checkDuplicateValues=[user_id];

        connection.query(checkDuplicateSql ,checkDuplicateValues ,(err,result)=>{
            if(err) throw err;

            if(result.length>0){
                return res.json({
                    message:'이미 사용중인 아이디입니다.',
                    redirectUrl:'/register'
                });
            } else{
                bcrypt.hash(pw,saltRounds,function(err,hash){
                    if(err) throw err;

                    var sql=`INSERT INTO member (user_id,pw,name ,resetQuestion ,resetAnswer ) VALUES (?, ?, ?, ?, ?)`;
                    var values=[user_id, hash,name ,resetQuestion ,resetAnswer ];

                    connection.query(sql ,values ,(err,result)=>{
                        if(err) throw err;

                        console.log('회원가입이 완료되었습니다.');

                        const token=jwt.sign({user_id},secretKey,{
                            expiresIn:'1h',
                        });

                        console.log('토큰:',token);

                        return res.json({
                            message:'회원가입이 완료되었습니다.',
                            redirectUrl:'/login'
                        });
                    });
                });
            }
        });
    }
});


app.get('/reset-password', function(req,res){
    res.json({view: "reset-password", resetQuestions: resetQuestions});
});

app.post("/reset-password",function(req,res){
    let username=req.body.user_id;
    let answer=req.body.answer;
    let newPassword=req.body.newPassword;
    let selectedQuestionIndex = req.body.selectedQuestionIndex;

    console.log("Selected Question Index:", selectedQuestionIndex); // 로그 추가
    console.log("Answer:", answer); // 로그 추가

    if (newPassword.length < 8 || newPassword.length > 20) {
        return res.json({
            message:'비밀번호는 최소 8자리, 최대 20자리까지 설정해주세요.',
            redirectUrl:'/reset-password'
        });
    } else{
        let sql="SELECT resetAnswer, resetQuestion FROM member WHERE user_id = ?";
        connection.query(sql ,[username] ,(err,result)=>{
            if(err) throw err;
            if(result.length>0 && result[0].resetAnswer===answer && result[0].resetQuestion === selectedQuestionIndex){
                bcrypt.hash(newPassword, saltRounds, function(err, hash) {
                    if (err) throw err;

                    var sql = `UPDATE member SET pw = ? WHERE user_id = ?`;
                    var values = [hash, username];

                    connection.query(sql ,values ,(err,result)=>{
                        if(err) throw err;

                        console.log('비밀번호가 재설정되었습니다.');

                        // 세션 제거
                        req.session.destroy(function(err){
                            // 에러 처리
                            if (err) throw err;

                            // 리다이렉트
                            return res.json({
                                message:'비밀번호가 재설정되었습니다. 다시 로그인 해주세요.',
                                redirectUrl:'/login'
                            });
                        });

                    });
                });
            } else{
                return res.json({
                    message:'답변이 일치하지 않습니다.',
                    redirectUrl:'/reset-password'
                });
            }
        });
    }
});


app.get('/addfavorite', (req, res) => {
    if (!req.session.member) {
        return res.json({redirect: '/login'});
    }
    res.json({view: 'addfavorite'});
});

app.post('/addfavoriteProc', (req, res) => {
    if (!req.session.member) {
        return res.json({redirect: '/login'});
    }

    const user_id = req.session.member.user_id;
    const title = req.body.title;
    const code = req.body.code;

    console.log("title:", title);
    console.log("code:", code);

    // 기존에 동일한 항목이 있는지 확인
    var checkSql="SELECT * FROM favorites WHERE user_id=? AND title=? AND code=?";
    var values=[user_id,title,code];

    connection.query(checkSql ,values ,(err,result)=>{
        if(err) throw err;

        // 중복되는 항목이 없으면 추가
        if(result.length===0){
            var sql='INSERT INTO favorites(user_id,title,code) VALUES(?,?,?)';

            connection.query(sql ,values ,(err,result)=>{
                if(err){
                    throw err;
                }

                console.log("즐겨찾기 추가");

                return  res.json({
                    message:'즐겨찾기에 추가하였습니다.',
                    redirectUrl:'/'
                });
            });
        } else{
            // 중복되는 항목이 있다면 메시지 출력
            console.log("이미 존재하는 항목");

            return  res.json({
                message:'이미 존재하는 항목입니다.',
                redirectUrl:'/'
            });
        }
    });
});

app.get('/addfavoriteDelete', (req,res)=>{
    if (!req.session.member){
        return  res.json({redirect: '/login'});
    }

    const user_id=req.session.member.user_id;
    const favoriteId=req.query.idx;

    var deleteSql='DELETE FROM favorites WHERE idx=? AND user_id=?';
    var deleteValues=[favoriteId,user_id];

    connection.query(deleteSql ,deleteValues ,(err,result)=>{
        if(err){
            throw err;
        }

        return  res.json({
            message:'즐겨찾기에서 삭제되었습니다.',
            redirectUrl:'/addfavoriteList'
        });

    });
});

app.get('/addfavoriteList', function(req,res){

    // 로그인 되어 있지 않은 경우 로그인 페이지로 이동합니다.
    if(!req.session.member){
        return  res.json({redirect: '/login'});
    }

    const user_id=req.session.member.user_id;

    var selectSql='SELECT * FROM favorites WHERE user_id=? ORDER BY idx DESC';
    var selectValues=[user_id];

    connection.query(selectSql ,selectValues ,(err,result)=>{
        if(err) throw err;

        let favoriteList=result.map(item=>{
            return{
                idx:item.idx,
                title:item.title,
                code:item.code
            };
        });

        // JSON 형태로 즐겨찾기 리스트 전달
        res.json({favorites: favoriteList});
    });
});


app.get('/logindeactivate', (req, res) => {
    res.json({view: 'logindeactivate', resetQuestions: resetQuestions});
})

app.post('/logindeactivate', async (req, res) => {
    const { user_id, pw, resetQuestionIndex, resetAnswer } = req.body;

    // 데이터베이스에서 사용자 찾기
    const sql = 'SELECT * FROM member WHERE user_id = ?';

    connection.query(sql, [user_id], async (err, result) => {
        if (err) throw err;

        if (result.length === 0 || result[0].resetQuestion !== resetQuestionIndex || result[0].resetAnswer !== resetAnswer) {
            return res.json({
                message:'사용자 정보가 일치하지 않습니다.',
                redirectUrl:'/logindeactivate'
            });
        } else {
            const storedHash = result[0].pw;
            const passwordMatches = await bcrypt.compare(pw, storedHash);

            if (!passwordMatches) {
                return res.json({
                    message:'사용자 정보가 일치하지 않습니다.',
                    redirectUrl:'/logindeactivate'
                });
            } else {
                const deleteSql = 'DELETE FROM member WHERE user_id = ?';

                connection.query(deleteSql , [user_id],(err,result)=>{
                    if(err){
                        throw err;
                    }

                    // 로그아웃 처리 - 세션을 초기화합니다.
                    req.session.member=null;

                    return  res.json({
                        message:'회원탈퇴가 완료되었습니다.',
                        redirectUrl:'/'
                    });
                });
            }
        }
    });
});


app.get('/stocks', (req, res) => {
    res.json({view: 'stocks', stockInfo: null });
});

app.post('/getStockInfo', async (req, res) => {
    const stockName = req.body.stockName;

    // MySQL에서 종목 코드와 감성 분석 결과 조회
    const query = 'SELECT stockCode, sentiment, day1_5_date, day2_5_date, day3_5_date, day4_5_date, day5_5_date, day1_10_date, day2_10_date, day3_10_date, day4_10_date, day5_10_date ,day6_10_date ,day7_10_date ,day8_10_date ,day9_10_date ,day10_10_date, day1_5_price, day2_5_price, day3_5_price, day4_5_price, day5_5_price, day1_10_price, day2_10_price, day3_10_price,day4_10_price,day5_10_price,day6_10_price,day7_10_price,day8_10_price,day9_10_price,day10_10_price FROM stocks WHERE stockName = ?';

    connection.query(query,[stockName], async (err,result)=>{
        if(err){
            console.error('종목 코드 조회 중 오류 발생:', err);
            return  res.json({stockInfo:null});
        }

        if(result.length === 0){
            console.log('해당 종목 이름을 가진 종목을 찾을 수 없습니다.');
            return  res.json({stockInfo:null});
        }

        const predict5 = {
            day1_5PredictedPrice : result[0].day1_5_price,
            day2_5PredictedPrice : result[0].day2_5_price,
            day3_5PredictedPrice : result[0].day3_5_price,
            day4_5PredictedPrice : result[0].day4_5_price,
            day5_5PredictedPrice : result[0].day5_5_price,
            day1_5Date : result[0].day1_5_date,
            day2_5Date : result[0].day2_5_date,
            day3_5Date : result[0].day3_5_date,
            day4_5Date : result[0].day4_5_date,
            day5_5Date : result[0].day5_5_date,
        }

        const predict10 = {
            day1_10PredictedPrice : result[0].day1_10_price,
            day2_10PredictedPrice : result[0].day2_10_price,
            day3_10PredictedPrice : result[0].day3_10_price,
            day4_10PredictedPrice : result[0].day4_10_price,
            day5_10PredictedPrice : result[0].day5_10_price,
            day6_10PredictedPrice : result[0].day6_10_price,
            day7_10PredictedPrice : result[0].day7_10_price,
            day8_10PredictedPrice : result[0].day8_10_price,
            day9_10PredictedPrice : result[0].day9_10_price,
            day10_10PredictedPrice : result[0].day10_10_price,
            day1_10Date : result[0].day1_10_date,
            day2_10Date : result[0].day2_10_date,
            day3_10Date : result[0].day3_10_date,
            day4_10Date : result[0].day4_10_date,
            day5_10Date : result[0].day5_10_date,
            day6_10Date : result[0].day6_10_date,
            day7_10Date : result[0].day7_10_date,
            day8_10Date : result[0].day8_10_date,
            day9_10Date : result[0].day9_10_date,
            day10_10Date : result[0].day10_10_date,
        }

        const stockCode = result[0].stockCode;
        const sentiment = result[0].sentiment; // 감성 분석 결과 가져오기
        const url = `https://finance.naver.com/item/main.nhn?code=${stockCode}`;
        //const day1_5PredictedPrice = result[0].day1_5_price;
        //const day2_5PredictedPrice = result[0].day2_5_price;
        //const day3_5PredictedPrice = result[0].day3_5_price;
        //const day4_5PredictedPrice = result[0].day4_5_price;
        //const day5_5PredictedPrice = result[0].day5_5_price;
        //const day1_10PredictedPrice = result[0].day1_10_price;
        //const day2_10PredictedPrice = result[0].day2_10_price;
        //const day3_10PredictedPrice = result[0].day3_10_price;
        //const day4_10PredictedPrice = result[0].day4_10_price;
        //const day5_10PredictedPrice = result[0].day5_10_price;
        //const day6_10PredictedPrice = result[0].day6_10_price;
        //const day7_10PredictedPrice = result[0].day7_10_price;
        //const day8_10PredictedPrice = result[0].day8_10_price;
        //const day9_10PredictedPrice = result[0].day9_10_price;
        //const day10_10PredictedPrice = result[0].day10_10_price;
        //const day1_5Date = result[0].day1_5_date;
        //const day2_5Date = result[0].day2_5_date;
        //const day3_5Date = result[0].day3_5_date;
        //const day4_5Date = result[0].day4_5_date;
        //const day5_5Date = result[0].day5_5_date;
        //const day1_10Date = result[0].day1_10_date;
        //const day2_10Date = result[0].day2_10_date;
        //const day3_10Date = result[0].day3_10_date;
        //const day4_10Date = result[0].day4_10_date;
        //const day5_10Date = result[0].day5_10_date;
        //const day6_10Date = result[0].day6_10_date;
        //const day7_10Date = result[0].day7_10_date;
        //const day8_10Date = result[0].day8_10_date;
        //const day9_10Date = result[0].day9_10_date;
        //const day10_10Date = result[0].day10_10_date;

        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);

            // 주식 정보 파싱하기
            const currentPrice = $('#chart_area > div.rate_info > div > p.no_today > em').text();
            const changeElement = $('#chart_area > div.rate_info > div');
            const changeSign = changeElement.find('em.no_exday').hasClass('up') ? '+' : (changeElement.find('em.no_exday').hasClass('down') ? '-' : '');
            const change = changeSign + changeElement.find('p.no_exday em span.blind').text();
            const changePercentage = changeSign + changeElement.find('p.no_exday em span.blind').next().text();

            var newsUrl=`https://www.mk.co.kr/search?word=${encodeURIComponent(stockName)}`;
            var magazineUrl=`https://magazine.hankyung.com/search?query=${encodeURIComponent(stockName)}`;
            var economistUrl=`https://economist.co.kr/article/search?searchText=${encodeURIComponent(stockName)}`;

            // 즐겨찾기에 해당 주식이 있는지 확인
            const favoriteQuery='SELECT * FROM favorites WHERE user_id=? AND title=?';
            connection.query(favoriteQuery,[user_id,stockName],(err2,favoriteResults)=>{
                if(err2){
                    console.error("즐겨찾기 조회 중 오류 발생:", err2);
                    return  res.json({stockInfo:null});
                }

                var isFavorite=false;

                if(favoriteResults.length>0){
                    isFavorite=true;
                }

                var stockInfo={
                    stockName:stockName,
                    stockCode:stockCode,
                    currentPrice:currentPrice,
                    change:change,
                    changePercentage:changePercentage,
                    newsUrl : newsUrl,
                    magazineUrl : magazineUrl,
                    economistUrl : economistUrl,
                    sentiment:sentiment,
                    isFavorite:isFavorite,
                    // 5일치 예측 가격
                    day1_5PredictedPrice: predict5.day1_5PredictedPrice,
                    day2_5PredictedPrice: predict5.day2_5PredictedPrice,
                    day3_5PredictedPrice: predict5.day3_5PredictedPrice,
                    day4_5PredictedPrice: predict5.day4_5PredictedPrice,
                    day5_5PredictedPrice: predict5.day5_5PredictedPrice,
                    //10일치 예측 가격
                    day1_10PredictedPrice: predict10.day1_10PredictedPrice,
                    day2_10PredictedPrice: predict10.day2_10PredictedPrice,
                    day3_10PredictedPrice: predict10.day3_10PredictedPrice,
                    day4_10PredictedPrice: predict10.day4_10PredictedPrice,
                    day5_10PredictedPrice: predict10.day5_10PredictedPrice,
                    day6_10PredictedPrice: predict10.day6_10PredictedPrice,
                    day7_10PredictedPrice: predict10.day7_10PredictedPrice,
                    day8_10PredictedPrice: predict10.day8_10PredictedPrice,
                    day9_10PredictedPrice: predict10.day9_10PredictedPrice,
                    day10_10PredictedPrice: predict10.day10_10PredictedPrice,
                    //5일치 날짜
                    day1_5Date: predict5.day1_5Date,
                    day2_5Date: predict5.day2_5Date,
                    day3_5Date: predict5.day3_5Date,
                    day4_5Date: predict5.day4_5Date,
                    day5_5Date: predict5.day5_5Date,
                    //10일치 날짜
                    day1_10Date: predict10.day1_10Date,
                    day2_10Date: predict10.day2_10Date,
                    day3_10Date: predict10.day3_10Date,
                    day4_10Date: predict10.day4_10Date,
                    day5_10Date: predict10.day5_10Date,
                    day6_10Date: predict10.day6_10Date,
                    day7_10Date: predict10.day7_10Date,
                    day8_10Date: predict10.day8_10Date,
                    day9_10Date: predict10.day9_10Date,
                    day10_10Date: predict10.day10_10Date,
                };

                return res.json({stockInfo : stockInfo});

                /* 사용자 정보를 JSON 형태로 응답 */
                //const responseBody={
                //    "user_id":memberInfoTemp.user_id,
                //    "pw":memberInfoTemp.pw,
                //    "name":memberInfoTemp.name,
                //    "message":'로그인 되었습니다.',
                //    "redirectUrl":'/'
                //};

                const responseBody = {
                    "stockName": stockName,
                    "stockCode":stockCode,
                    "currentPrice":currentPrice,
                    "change":change,
                    "changePercentage":changePercentage,
                    "newsUrl" : newsUrl,
                    "magazineUrl" : magazineUrl,
                    "economistUrl" : economistUrl,
                    "sentiment": sentiment,
                    "predict5": predict5,
                    "predict10": predict10
                }

                return res.json(responseBody);

            });
        } catch(error){
            console.error("주식 데이터를 가져오는 중 오류 발생:", error);
            return  res.json({stockInfo:null});
        }
    });
});


async function getMainStocks() {
    let mainstocksInfo = [];
    try {
        // Define the symbols for the indices you are interested in.
        const indices = [
            { name: 'KOSPI', symbol: '^KS11' },
            { name: 'KOSDAQ', symbol: '^KQ11' },
            { name: 'KOSPI200', symbol: '^KS200'}
        ];

        for (let index of indices) {
            // Get data from Yahoo Finance
            const data = await yahooFinance.historical({
                symbol: index.symbol,
                from: '2020-01-01',
                to:'2099-12-31',
                period:'d'
            });

            let csvContent = "Date, Close\n";

            data.forEach((row) => {
                csvContent += `${row.date.toISOString().split('T')[0]}, ${row.close}\n`;
            });

            fs.writeFileSync(`${index.name}_data.csv`, csvContent);

            mainstocksInfo.push({
                name:index.name,
                value:'Saved to CSV',
                csvUrl:`http://localhost:3000/download/${index.name}_data.csv`
                // Replace "your-server-url" with your actual server's url.
                // This url will directly download the corresponding file when accessed.

            });
        }

    } catch(error) {
        console.error("Error while getting stock data:", error);
    }

    return mainstocksInfo;
}

app.get('/mainstocks', async (req, res) => {
    const mainstocksInfo = await getMainStocks();
    res.json(mainstocksInfo);
});

app.get('/download/:file', (req, res) => {
    const file = req.params.file;
    const filePath = path.join(__dirname, file);

    // Check if file exists before sending it
    if(fs.existsSync(filePath))
        res.download(filePath);
    else
        res.status(404).send("File not found");
});

let storedData = null; // 데이터 저장을 위한 변수

app.get('/stocks', async (req, res) => {
    let stockNamesQuery = `SELECT stockName FROM stocks;`;
    let stockNames = [];

    // Get all the stock names from the database
    try {
        const [rows] = await connection.promise().query(stockNamesQuery);
        stockNames = rows.map(row => row.stockName);
    } catch (err) {
        console.log("An error occurred performing the query.");
        return res.status(500).send('Database query error');
    }

    let promises = [];
    let results = {};

    for (let stockName of stockNames) {
        const sqlQuery = `SELECT sentiment FROM stocks WHERE stockName=?;`;

        let promise = new Promise((resolve, reject) => {
            connection.query(sqlQuery, [stockName], function(err, rows){
                if(err){
                    console.log("An error occurred performing the query.");
                    reject(new Error('Database query error'));
                } else {
                    console.log("Query successfully executed");
                    results[stockName] = rows[0].sentiment;
                    resolve();
                }
            });
        });

        promises.push(promise);
    }

    try{
        await Promise.all(promises);
        res.status(200).json(results);
    } catch(error){
        res.status(500).send(error.message);
    }
});


app.get('/sentiment', async (req, res) => {
    const stockName = req.query.stockName;  // URL 쿼리 파라미터에서 주식 이름 가져오기

    if (!stockName) {
        res.json({ message: 'No stock name provided' });  // 주식 이름이 제공되지 않았으면 메시지 전송
        return;
    }

    const sqlQuery = `SELECT * FROM stocks WHERE stockName=?;`;

    connection.query(sqlQuery, [stockName], function(err, rows){
        if(err){
            console.log("An error occurred performing the query:");
            console.log(err);  // 에러 객체 출력
            res.status(500).send(err.message);
        } else {
            console.log("Query successfully executed");
            if(rows.length > 0) {
                let stockInfo = rows[0];
                let sentimentDescription = "";
                if(stockInfo.sentiment > 0) {
                    sentimentDescription = "긍정적입니다.";
                } else {
                    sentimentDescription = "부정적입니다.";
                }
                stockInfo.sentimentDescription = sentimentDescription;

                res.json({
                    stockInfo: stockInfo
                });
            } else {
                res.status(404).json({ message: 'Stock not found' });
            }
        }
    });
});


app.post('/sentiment', async (req, res) => {
    let jsonData = req.body.sentiment;
    let promises = [];

    for (let stock in jsonData) {
        let sentiment = jsonData[stock];

        const sqlQuery = `INSERT INTO stocks (stockName, sentiment) VALUES (?, ?) ON DUPLICATE KEY UPDATE sentiment=?`;

        let promise = new Promise((resolve, reject) => {
            connection.query(sqlQuery, [stock, sentiment, sentiment], function(err){
                if(err){
                    console.log("An error occurred performing the query:");
                    console.log(err);  // 에러 객체 출력
                    reject(new Error('Database query error'));
                } else {
                    console.log("Query successfully executed");
                    resolve();
                }
            });
        });

        promises.push(promise);
    }

    try{
        await Promise.all(promises);
        res.status(200).json(jsonData);
    } catch(error){
        res.status(500).json({ message: error.message });
    }
});


app.get('/day_five', async (req, res) => {
    const stockName = req.query.stockName;  // URL 쿼리 파라미터에서 주식 이름 가져오기

    if (!stockName) {
        res.json({ message: 'No stock name provided' });  // 주식 이름이 제공되지 않았으면 메시지 전송
        return;
    }

    const sqlQuery = `SELECT * FROM stocks WHERE stockName=?`;

    connection.query(sqlQuery, [stockName], function(err, rows){
        if(err){
            console.log("An error occurred performing the query:");
            console.log(err);  // 에러 객체 출력
            res.status(500).send(err.message);
        } else {
            console.log("Query successfully executed");
            if(rows.length > 0) {
                let stockInfo = rows[0];
                let dayFiveDescription = "";
                if(stockInfo.day_five > 0) {
                    dayFiveDescription = "긍정적입니다.";
                } else {
                    dayFiveDescription = "부정적입니다.";
                }
                stockInfo.dayFiveDescription = dayFiveDescription;

                res.json({
                    stockInfo: stockInfo
                });
            } else {
                res.status(404).json({ message: 'Stock not found' });
            }
        }
    });
});


app.post('/day_five', async (req, res) => {
    let jsonData = req.body.day_five;
    let promises = [];

    for (let stock in jsonData) {
        let dayFiveValue = jsonData[stock];

        const sqlQuery = `INSERT INTO stocks (stockName, day1_5_date, day2_5_date, day3_5_date, day4_5_date, day5_5_date, day1_5_price, day2_5_price, day3_5_price, day4_5_price, day5_5_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE day1_5_price=?, day2_5_price=?, day3_5_price=?, day4_5_price=?,day5_5_price=?, day1_5_date=?, day2_5_date=?, day3_5_date=?, day4_5_date=?. day5_5_date=?`;

        let promise = new Promise((resolve, reject) => {

            connection.query(sqlQuery,
                [stock,
                    ...dayFiveValue,
                    ...dayFiveValue], // Use the spread operator to expand the array
                function(err){
                    if(err){
                        console.log("An error occurred performing the query:");
                        console.log(err);  // 에러 객체 출력
                        reject(new Error('Database query error'));
                    } else{
                        console.log("Query successfully executed");
                        resolve();
                    }
                });

        });

        promises.push(promise);
    }

    try{
        await Promise.all(promises);
        res.status(200).json(jsonData);
    } catch(error){
        res.status(500).json({ message: error.message });
    }
});



app.get('/day_ten', async (req, res) => {
    const stockName = req.query.stockName;  // URL 쿼리 파라미터에서 주식 이름 가져오기

    if (!stockName) {
        res.json({ message: 'No stock name provided' });  // 주식 이름이 제공되지 않았으면 메시지 전송
        return;
    }

    const sqlQuery = `SELECT * FROM stocks WHERE stockName=?`;

    connection.query(sqlQuery, [stockName], function(err, rows){
        if(err){
            console.log("An error occurred performing the query:");
            console.log(err);  // 에러 객체 출력
            res.status(500).send(err.message);
        } else {
            console.log("Query successfully executed");
            if(rows.length > 0) {
                let stockInfo = rows[0];
                res.json({
                    stockInfo: stockInfo
                });
            } else {
                res.status(404).json({ message: 'Stock not found' });
            }
        }
    });
});


app.post('/day_ten', async (req, res) => {
    let jsonData = req.body.day_ten;

    let promises = [];

    for (let stockName in jsonData) {

        let dayTenData = jsonData[stockName];

        if(!Array.isArray(dayTenData) || dayTenData.length !==10 ) {
            return res.status(400).json({error: 'Invalid data format. Expecting an array of length 10.'});
        }

        const sqlQuery = `INSERT INTO stocks (stockName, day1_10_price, day2_10_price, day3_10_price, day4_10_price, day5_10_price, day6_10_price, day7_10_price, day8_10_price, day9_10_price, day10_10_price, day1_10_date, day2_10_date, day3_10_date, day4_10_date, day5_10_date, day6_10_date, day7_10_date, day8_10_date, day9_10_date, day10_10_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)ON DUPLICATE KEY UPDATE day1_10_price=?, day2_10_price=?, day3_10_price=?, day4_10_price=?, day5_10_price=?, day6_10_price_=?, day7_10_price_=?, day8_10_price =?, day9_10_price =?, day10_10_price =?, day1_10_date =?,day2_10_date =?,day3_10_date =?,day4_10_date =?,day5_10_date =?,day6_10_date =?,day7_10_date =?,day8_10_date =?,day9_10_date =?, day10_10_date =?`;


        let promise = new Promise((resolve,reject)=>{

            connection.query(sqlQuery,[stock,...dayTenData,...dayTenData],function(err){ // modified line
                if(err){
                    console.log("An error occurred performing the query:");
                    console.log(err);
                    reject(new Error('Database query error'));
                } else{
                    console.log("Query successfully executed");
                    resolve();
                }
            });

        });

        promises.push(promise);
    }

    try{
        await Promise.all(promises);
        res.status(200).json(jsonData);
    } catch(error){
        res.status(500).json({ message: error.message });
    }
});

app.get('/asentiment', (req, res) => {
    if(storedData) {
        res.json({ sentimentData: storedData });
    } else {
        res.json({ sentimentData: { message: 'No data' } });
    }
});

app.post('/asentiment', (req, res) => {
    const data = req.body;
    console.log("Received JSON data:", data);
    storedData = data; // 데이터 저장
    res.status(200).json(data);
});

app.listen(port, () => {
    console.log(`서버가 실행되었습니다.`)
})
