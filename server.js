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

   res.render('index')   // ./views/index.ejs
})

app.get('/profile', (req, res) => {
   res.render('profile')
})

app.get('/contact', (req, res) => {
   res.render('contact')
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
       res.send("<script> alert('문의사항이 등록되었습니다.'); location.href='/';</script>");
   })
})

app.get('/contactDelete', (req, res) => {
   var idx = req.query.idx
   var sql = `delete from contact where idx='${idx}' `
   connection.query(sql, function (err, result){
      if(err) throw err;

      res.send("<script> alert('삭제되었습니다.'); location.href='/contactList';</script>");
  })
})


app.get('/contactList', (req, res) => {

   var sql = `select * from contact order by idx desc `
   connection.query(sql, function (err, results, fields){
      if(err) throw err;
      res.render('contactList',{lists:results})
   })
})


app.get('/login', (req, res) => {
    res.render('login')
});

app.post('/loginProc', async (req, res) => {
    const user_id = req.body.user_id;
    const enteredPassword = req.body.pw;

    var sql = `SELECT * FROM member WHERE user_id = ?`;
    var values = [user_id];

    connection.query(sql, values, async function (err, result) {
        if (err) throw err;

        if (result.length == 0) {
            res.send("<script> alert('존재하지 않는 아이디입니다.'); location.href='/login';</script>");
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

                    // Use the temporarily saved member info here.
                    req.session.member=memberInfoTemp;

                    return res.send("<script> alert('로그인 되었습니다.'); location.href='/';</script>");

                });
            } else {
                return  res.send("<script> alert('비밀번호가 일치하지 않습니다.'); location.href='/login';</script>");
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
    res.render('loginedit');
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
            res.render('loginedit');
        } else {
            const storedHash = result[0].pw;
            const passwordMatches = await bcrypt.compare(old_pw, storedHash);

            if (!passwordMatches) {
                res.send("<script> alert('이전 비밀번호가 일치하지 않습니다.'); location.href='/loginedit';</script>");
            } else {
                const newHash = await bcrypt.hash(new_pw, saltRounds);
                var updateSql = `UPDATE member SET pw = ? WHERE user_id = ?`;
                var updateValues = [newHash, user_id];

                connection.query(updateSql, updateValues, function (err, result) {
                    if (err) throw err;

                    console.log('비밀번호가 수정되었습니다.');
                    res.send("<script> alert('비밀번호가 수정되었습니다.'); location.href='/';</script>");
                });
            }
        }
    });
});


app.get('/logout', (req, res) => {

   req.session.member = null;
   res.send("<script> alert('로그아웃 되었습니다.'); location.href='/';</script>");

})

app.get('/register', (req, res) => {
   res.render('register')
})


app.post('/register', (req, res) => {
    const user_id = req.body.user_id;
    const pw = req.body.pw;
    const name = req.body.name;

    if (pw.length < 8 || pw.length > 20) {
        res.send("<script> alert('비밀번호는 최소 8자리, 최대 20자리까지 설정해주세요.'); location.href='/register';</script>");
    } else {
        var checkDuplicateSql = `SELECT * FROM member WHERE user_id = ? OR name = ?`;
        var checkDuplicateValues = [user_id, name];

        connection.query(checkDuplicateSql, checkDuplicateValues, function (err, result) {
            if (err) throw err;

            if (result.length > 0) {
                res.send("<script> alert('이미 사용중인 회원입니다.'); location.href='/register';</script>");
            } else {
                bcrypt.hash(pw, saltRounds, function(err, hash) {
                    if (err) throw err;

                    var sql = `INSERT INTO member (user_id, pw, name) VALUES (?, ?, ?)`;
                    var values = [user_id, hash, name];

                    connection.query(sql, values, function (err, result) {
                        if (err) throw err;

                        console.log('회원가입이 완료되었습니다.');

                        const token = jwt.sign({ user_id }, secretKey, {
                            expiresIn: '1h',
                        });

                        console.log('토큰:', token);

                        res.send("<script> alert('회원가입이 완료되었습니다.'); location.href='/login';</script>");
                    });
                });
            }
        });
    }
});


app.get('/addfavorite', (req, res) => {
    res.render('addfavorite');
})


app.post('/addfavoriteProc', (req, res) => {
    const title = req.body.title;
    const code = req.body.code;

    console.log("title:", title);
    console.log("code:", code);

    // 기존에 동일한 항목이 있는지 확인
    var checkSql = "SELECT * FROM favorites WHERE title = ? AND code = ?";
    var values = [title, code];

    connection.query(checkSql, values, function (err, result) {
        if (err) throw err;

        // 중복되는 항목이 없으면 추가
        if (result.length === 0) {
            var sql = "INSERT INTO favorites(title, code) VALUES(?, ?)";

            connection.query(sql, values, function (err, result) {
                if (err) throw err;
                console.log("즐겨찾기 추가");
                res.send("<script> alert('즐겨찾기에 추가하였습니다.'); location.href='/';</script>");
            });
        } else {
            // 중복되는 항목이 있다면 메시지 출력
            console.log("이미 존재하는 항목");
            res.send("<script> alert('이미 존재하는 항목입니다.'); location.href='/';</script>");
        }
    });
});

app.get('/addfavoriteDelete', (req, res) => {
   var idx = req.query.idx
   var sql = `delete from favorites where idx='${idx}' `
   connection.query(sql, function (err, result){
      if(err) throw err;

      res.send("<script> alert('즐겨찾기에서 삭제되었습니다.'); location.href='/addfavoriteList';</script>");
  })
})

app.get('/addfavoriteList', (req, res) => {
    var sql = `select * from favorites order by idx desc`;
    connection.query(sql, function (err, results, fields) {
        if (err) throw err;

        // 배열 생성 및 결과 저장
        let favoriteList = results.map(result => {
            return {
                idx: result.idx,
                title: result.title,
                code: result.code
            };
        });

        res.json({favorites: favoriteList});
    });
});

app.get('/findname', (req, res) => {
    res.render('findname');
})

app.post('/findname', async (req, res) => {
    const user_id = req.body.user_id;

    var findNameSql = `SELECT * FROM member WHERE user_id = ?`;
    var findNameValues = [user_id];

    connection.query(findNameSql, findNameValues, function (err, result) {
        if (err) throw err;

        if (result.length > 0) {
            const name = result[0].name;
            res.send(`<script> alert('회원님의 이름은 ${name}입니다.'); location.href='/findname';</script>`);
        } else {
            res.send(`<script> alert('일치하는 회원 정보가 없습니다.'); location.href='/findname';</script>`);
        }
    });
});


app.get('/logindeactivate', (req, res) => {
    res.render('logindeactivate');
})

app.post('/logindeactivate', async (req, res) => {
    const { user_id, pw } = req.body;

    // 데이터베이스에서 사용자 찾기
    const sql = 'SELECT * FROM member WHERE user_id = ?';

    connection.query(sql, [user_id], async (err, result) => {
        if (err) throw err;

        if (result.length === 0) {
            res.send("<script> alert('사용자 정보가 일치하지 않습니다.'); location.href='/logindeactivate';</script>");
        } else {
            const storedHash = result[0].pw;
            const passwordMatches = await bcrypt.compare(pw, storedHash);

            if (!passwordMatches) {
                res.send("<script> alert('사용자 정보가 일치하지 않습니다.'); location.href='/logindeactivate';</script>");
            } else {
                const deleteSql = 'DELETE FROM member WHERE user_id = ?';
                connection.query(deleteSql, [user_id], (err, result) => {
                    if (err) throw err;

                    // 로그아웃 처리 - 세션을 초기화합니다.
                    req.session.member = null;

                    res.send("<script> alert('회원탈퇴가 완료되었습니다.'); location.href='/';</script>");
                });
            }
        }
    });
});


app.get('/resetpw', (req, res) => {
    const user_id = req.query.user_id;
    const name = req.query.name;

    res.render('resetpw', { user_id: user_id, name: name });
});

app.post('/resetpw', async (req, res) => {
    const user_id = req.body.user_id;
    const name = req.body.name;
    const new_pw = req.body.new_pw;

    // Check if the entered name matches the one in the database
    var checkSql = `SELECT * FROM member WHERE user_id = ? AND name = ?`;
    var checkValues = [user_id, name];

    connection.query(checkSql, checkValues, async function (err, result) {
        if (err) throw err;

        // If there is no match for both user_id and name
        if(result.length === 0){
            return res.send("<script> alert('아이디와 이름이 일치하지 않습니다.'); location.href='/resetpw';</script>");
        }

        if (new_pw.length < 8 || new_pw.length > 20) {
            res.send("<script> alert('비밀번호는 최소 8자리, 최대 20자리까지 설정해주세요.'); location.href='/resetpw';</script>");
        } else {
            bcrypt.hash(new_pw, saltRounds, function(err, hash) {
                if (err) throw err;

                var sql = `UPDATE member SET pw=? WHERE user_id=?`;
                var values = [hash ,user_id];

                connection.query(sql ,values ,(err,result)=>{
                    if(err){
                        console.log("Failed to reset password");
                        throw err;
                    }
                    console.log("Password reset successfully");

                    // Reset the session after password change
                    req.session.member = null;

                    return res.send("<script> alert('비밀번호가 성공적으로 변경되었습니다. 다시 로그인 해주세요.'); location.href='/login';</script>");
                });
            });
        }
    });
});




app.get('/stocks', (req, res) => {
    res.render('stocks', { stockInfo: null });
});

app.post('/getStockInfo', async (req, res) => {
    const stockName = req.body.stockName;

    // MySQL에서 종목 코드 조회
    const query = 'SELECT stockCode FROM stocks WHERE stockName = ?';
    connection.query(query, [stockName], async (err, results) => {
        if (err) {
            console.error('종목 코드 조회 중 오류 발생:', err);
            res.render('stocks', { stockInfo: null });
            return;
        }

        if (results.length === 0) {
            console.log('해당 종목 이름을 가진 종목을 찾을 수 없습니다.');
            res.render('stocks', { stockInfo: null });
            return;
        }

        const stockCode = results[0].stockCode;
        const url = `https://finance.naver.com/item/main.nhn?code=${stockCode}`;

        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);

            const currentPrice = $('#chart_area > div.rate_info > div > p.no_today > em').text();
            const change = $('#chart_area > div.rate_info > div > p.no_exday > em > span.blind').text();
            const changePercentage=$('#chart_area>div.rate_info>div>p.no_exday>em>span.blind').next().text();

            // Add news search urls
            var newsUrl=`https://www.mk.co.kr/search?word=${encodeURIComponent(stockName)}`;
            var magazineUrl=`https://magazine.hankyung.com/search?query=${encodeURIComponent(stockName)}`;
            var economistUrl=`https://economist.co.kr/article/search?searchText=${encodeURIComponent(stockName)}`;

            // Add the news urls to the returned object
            var stockInfo={
                stockName:stockName,
                stockCode:stockCode,
                currentPrice:currentPrice,
                change:change,
                changePercentage:changePercentage,
                newsUrl : newsUrl,
                magazineUrl : magazineUrl,
                economistUrl : economistUrl
            };

            res.render('stocks',{stockInfo : stockInfo});

        } catch(error){
            console.error("주식 데이터를 가져오는 중 오류 발생:", error);
            res.render("stocks",{stockInfo:null});
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
            { name: 'KOSPI200', symbol: '^KS11'}
        ];

        for (let index of indices) {
            // Get data from Yahoo Finance
            const data = await yahooFinance.historical({
                symbol: index.symbol,
                from: '2020-01-01',
                to:'2023-12-31',
                period:'d'
            });

            let csvContent = "Date,Open,High,Low,Close\n";

            data.forEach((row) => {
                csvContent += `${row.date.toISOString().split('T')[0]},${row.open},${row.high},${row.low},${row.close}\n`;
            });

            fs.writeFileSync(`${index.name}_data.csv`, csvContent);
            mainstocksInfo.push({name:index.name,value:'Saved to CSV'});

        }

    } catch(error) {
        console.error("Error while getting stock data:", error);
    }

    return mainstocksInfo;
}

app.get('/mainstocks', async (req, res) => {
    let mainstocksInfo;
    try{
        mainstocksInfo=await getMainStocks();
    }catch(error){
        console.error("주식 데이터를 가져오는 중 오류 발생:", error);
    }
    res.render("mainstocks",{mainstocksInfo : mainstocksInfo });
});

app.get('/download/:file', (req, res) => {
    const file = req.params.file;
    const filePath = path.join(__dirname, file);
    res.download(filePath);
});

app.listen(port, () => {
  console.log(`서버가 실행되었습니다.`)
})