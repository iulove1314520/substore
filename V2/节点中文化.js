// 将节点名称中的英文国家、地区和城市统一为简体中文，并补齐或纠正旗帜。
/**
 * 节点中文化
 * 功能：将节点名称中的英文地理标识统一替换为简体中文名称
 * 说明：
 * 1. 兼容大小写差异、空格、下划线、短横线、斜杠、连写等命名方式
 * 2. 同时支持常见地区缩写、英文全称和城市名
 * 3. 保留城市信息，例如 USA Los Angeles 会转换为美国 洛杉矶
 * 4. 自动添加或纠正开头的国家/地区旗帜
 * 5. 不修改原节点对象，只替换名称并保留倍率、线路、编号等信息
 */

const SEPARATOR_PATTERN = String.raw`(?:[\s._\-/]*)`;
const LEADING_FLAG_RE = /^(?:(?:[\uD83C][\uDDE6-\uDDFF]){2}\s*)+/;
const PROVIDER_PREFIX_RE = /^(?:(?:（[^）]*）|\([^)]*\)|【[^】]*】|\[[^\]]*\])\s*)+/;
const STANDALONE_AMERICA_RE = /(^|[^A-Za-z])America(?=$|[^A-Za-z])/gi;
const SIMPLIFIED_NAME_REPLACEMENTS = [
  ["臺灣", "台湾"],
  ["台灣", "台湾"],
  ["澳門", "澳门"],
  ["中國", "中国"],
  ["韓國", "韩国"],
  ["馬來西亞", "马来西亚"],
  ["泰國", "泰国"],
  ["菲律賓", "菲律宾"],
  ["孟加拉國", "孟加拉国"],
  ["印度尼西亞", "印度尼西亚"],
  ["阿聯酋", "阿联酋"],
  ["哈薩克斯坦", "哈萨克斯坦"],
  ["英國", "英国"],
  ["德國", "德国"],
  ["法國", "法国"],
  ["義大利", "意大利"],
  ["荷蘭", "荷兰"],
  ["冰島", "冰岛"],
  ["芬蘭", "芬兰"],
  ["丹麥", "丹麦"],
  ["比利時", "比利时"],
  ["奧地利", "奥地利"],
  ["愛爾蘭", "爱尔兰"],
  ["盧森堡", "卢森堡"],
  ["波蘭", "波兰"],
  ["羅馬尼亞", "罗马尼亚"],
  ["希臘", "希腊"],
  ["俄羅斯", "俄罗斯"],
  ["烏克蘭", "乌克兰"],
  ["美國", "美国"],
  ["哥倫比亞", "哥伦比亚"],
  ["秘魯", "秘鲁"],
  ["澳大利亞", "澳大利亚"],
  ["紐西蘭", "新西兰"],
  ["奈及利亞", "尼日利亚"],
  ["保加利亞", "保加利亚"],
  ["臺北", "台北"],
  ["臺中", "台中"],
  ["東京", "东京"],
  ["橫濱", "横滨"],
  ["福岡", "福冈"],
  ["首爾", "首尔"],
  ["洛杉磯", "洛杉矶"],
  ["聖何塞", "圣何塞"],
  ["紐約", "纽约"],
  ["西雅圖", "西雅图"],
];

const LOCATION_FLAGS = {
  香港: "🇭🇰",
  澳门: "🇲🇴",
  台湾: "🇹🇼",
  中国: "🇨🇳",
  日本: "🇯🇵",
  韩国: "🇰🇷",
  新加坡: "🇸🇬",
  马来西亚: "🇲🇾",
  泰国: "🇹🇭",
  菲律宾: "🇵🇭",
  越南: "🇻🇳",
  印度: "🇮🇳",
  孟加拉国: "🇧🇩",
  印度尼西亚: "🇮🇩",
  阿联酋: "🇦🇪",
  沙特阿拉伯: "🇸🇦",
  卡塔尔: "🇶🇦",
  哈萨克斯坦: "🇰🇿",
  以色列: "🇮🇱",
  土耳其: "🇹🇷",
  英国: "🇬🇧",
  德国: "🇩🇪",
  法国: "🇫🇷",
  意大利: "🇮🇹",
  西班牙: "🇪🇸",
  葡萄牙: "🇵🇹",
  荷兰: "🇳🇱",
  瑞士: "🇨🇭",
  瑞典: "🇸🇪",
  冰岛: "🇮🇸",
  挪威: "🇳🇴",
  芬兰: "🇫🇮",
  丹麦: "🇩🇰",
  比利时: "🇧🇪",
  奥地利: "🇦🇹",
  爱尔兰: "🇮🇪",
  卢森堡: "🇱🇺",
  波兰: "🇵🇱",
  捷克: "🇨🇿",
  匈牙利: "🇭🇺",
  罗马尼亚: "🇷🇴",
  希腊: "🇬🇷",
  俄罗斯: "🇷🇺",
  乌克兰: "🇺🇦",
  美国: "🇺🇸",
  加拿大: "🇨🇦",
  墨西哥: "🇲🇽",
  巴西: "🇧🇷",
  阿根廷: "🇦🇷",
  智利: "🇨🇱",
  哥伦比亚: "🇨🇴",
  秘鲁: "🇵🇪",
  澳大利亚: "🇦🇺",
  新西兰: "🇳🇿",
  南非: "🇿🇦",
  尼日利亚: "🇳🇬",
  埃及: "🇪🇬",
  保加利亚: "🇧🇬",
};

const LOCATION_CODES = {
  香港: ["hk", "hkg"],
  澳门: ["mo", "mac"],
  台湾: ["tw", "twn"],
  中国: ["cn", "chn"],
  日本: ["jp", "jpn"],
  韩国: ["kr", "kor"],
  新加坡: ["sg", "sgp"],
  马来西亚: ["my", "mys"],
  泰国: ["th", "tha"],
  菲律宾: ["ph", "phl"],
  越南: ["vn", "vnm"],
  印度: ["in", "ind"],
  孟加拉国: ["bd", "bgd"],
  印度尼西亚: ["id", "idn"],
  阿联酋: ["ae", "uae"],
  沙特阿拉伯: ["sa", "sau"],
  卡塔尔: ["qa", "qat"],
  哈萨克斯坦: ["kz", "kaz"],
  以色列: ["il", "isr"],
  土耳其: ["tr", "tur"],
  英国: ["uk", "gb", "gbr"],
  德国: ["de", "deu"],
  法国: ["fr", "fra"],
  意大利: ["it", "ita"],
  西班牙: ["es", "esp"],
  葡萄牙: ["pt", "prt"],
  荷兰: ["nl", "nld"],
  瑞士: ["ch", "che", "sui"],
  瑞典: ["se", "swe"],
  冰岛: ["is", "isl"],
  挪威: ["no", "nor"],
  芬兰: ["fi", "fin"],
  丹麦: ["dk", "dnk"],
  比利时: ["be", "bel"],
  奥地利: ["at", "aut"],
  爱尔兰: ["ie", "irl"],
  卢森堡: ["lu", "lux"],
  波兰: ["pl", "pol"],
  捷克: ["cz", "cze"],
  匈牙利: ["hu", "hun"],
  罗马尼亚: ["ro", "rou"],
  希腊: ["gr", "grc"],
  俄罗斯: ["ru", "rus"],
  乌克兰: ["ua", "ukr"],
  美国: ["us", "usa"],
  加拿大: ["ca", "can"],
  墨西哥: ["mx", "mex"],
  巴西: ["br", "bra"],
  阿根廷: ["ar", "arg"],
  智利: ["cl", "chl"],
  哥伦比亚: ["co", "col"],
  秘鲁: ["pe", "per"],
  澳大利亚: ["au", "aus"],
  新西兰: ["nz", "nzl"],
  南非: ["za", "zaf"],
  尼日利亚: ["ng", "nga"],
  埃及: ["eg", "egy"],
  保加利亚: ["bg", "bgr"],
};

// 城市规则先于国家/地区规则执行，避免城市信息被折叠成国家名称。
// 多词别名会自动兼容空格、点、下划线、短横线、斜杠和连写形式。
const CITY_RULES = buildCityRules([
  { country: "香港", zh: "九龙", aliases: ["kowloon"] },
  { country: "台湾", zh: "台北", aliases: ["taipei", ["tai", "pei"]] },
  { country: "台湾", zh: "高雄", aliases: ["kaohsiung", ["kaoh", "siung"]] },
  { country: "台湾", zh: "台中", aliases: ["taichung", ["tai", "chung"]] },
  { country: "台湾", zh: "新竹", aliases: ["hsinchu"] },
  { country: "台湾", zh: "台南", aliases: ["tainan"] },
  { country: "台湾", zh: "新北", aliases: [["new", "taipei"]] },
  { country: "中国", zh: "北京", aliases: ["beijing"] },
  { country: "中国", zh: "上海", aliases: ["shanghai"] },
  { country: "中国", zh: "广州", aliases: ["guangzhou"] },
  { country: "中国", zh: "深圳", aliases: ["shenzhen"] },
  { country: "中国", zh: "杭州", aliases: ["hangzhou"] },
  { country: "中国", zh: "成都", aliases: ["chengdu"] },
  { country: "中国", zh: "南京", aliases: ["nanjing"] },
  { country: "中国", zh: "武汉", aliases: ["wuhan"] },
  { country: "中国", zh: "厦门", aliases: ["xiamen"] },
  { country: "日本", zh: "东京", aliases: ["tokyo"] },
  { country: "日本", zh: "大阪", aliases: ["osaka"] },
  { country: "日本", zh: "横滨", aliases: ["yokohama"] },
  { country: "日本", zh: "名古屋", aliases: ["nagoya"] },
  { country: "日本", zh: "京都", aliases: ["kyoto"] },
  { country: "日本", zh: "福冈", aliases: ["fukuoka"] },
  { country: "日本", zh: "札幌", aliases: ["sapporo"] },
  { country: "日本", zh: "川崎", aliases: ["kawasaki"] },
  { country: "日本", zh: "埼玉", aliases: ["saitama"] },
  { country: "韩国", zh: "首尔", aliases: ["seoul"] },
  { country: "韩国", zh: "釜山", aliases: ["busan"] },
  { country: "韩国", zh: "仁川", aliases: ["incheon"] },
  { country: "马来西亚", zh: "吉隆坡", aliases: [["kuala", "lumpur"]] },
  { country: "马来西亚", zh: "槟城", aliases: ["penang"] },
  { country: "马来西亚", zh: "柔佛", aliases: ["johor"] },
  { country: "泰国", zh: "曼谷", aliases: ["bangkok"] },
  { country: "菲律宾", zh: "马尼拉", aliases: ["manila"] },
  { country: "越南", zh: "胡志明市", aliases: [["ho", "chi", "minh"], "saigon"] },
  { country: "越南", zh: "河内", aliases: ["hanoi"] },
  { country: "印度", zh: "孟买", aliases: ["mumbai"] },
  { country: "印度", zh: "德里", aliases: ["delhi"] },
  { country: "印度", zh: "班加罗尔", aliases: ["bangalore", "bengaluru"] },
  { country: "印度", zh: "海得拉巴", aliases: ["hyderabad"] },
  { country: "印度", zh: "金奈", aliases: ["chennai"] },
  { country: "印度", zh: "加尔各答", aliases: ["kolkata"] },
  { country: "孟加拉国", zh: "达卡", aliases: ["dhaka"] },
  { country: "印度尼西亚", zh: "雅加达", aliases: ["jakarta"] },
  { country: "印度尼西亚", zh: "泗水", aliases: ["surabaya"] },
  { country: "阿联酋", zh: "迪拜", aliases: ["dubai"] },
  { country: "阿联酋", zh: "阿布扎比", aliases: [["abu", "dhabi"]] },
  { country: "沙特阿拉伯", zh: "利雅得", aliases: ["riyadh"] },
  { country: "沙特阿拉伯", zh: "吉达", aliases: ["jeddah"] },
  { country: "卡塔尔", zh: "多哈", aliases: ["doha"] },
  { country: "哈萨克斯坦", zh: "阿斯塔纳", aliases: ["astana", ["nur", "sultan"]] },
  { country: "哈萨克斯坦", zh: "阿拉木图", aliases: ["almaty"] },
  { country: "以色列", zh: "特拉维夫", aliases: [["tel", "aviv"]] },
  { country: "以色列", zh: "耶路撒冷", aliases: ["jerusalem"] },
  { country: "土耳其", zh: "伊斯坦布尔", aliases: ["istanbul"] },
  { country: "土耳其", zh: "安卡拉", aliases: ["ankara"] },
  { country: "英国", zh: "伦敦", aliases: ["london"] },
  { country: "英国", zh: "曼彻斯特", aliases: ["manchester"] },
  { country: "英国", zh: "伯明翰", aliases: ["birmingham"] },
  { country: "德国", zh: "法兰克福", aliases: ["frankfurt"] },
  { country: "德国", zh: "柏林", aliases: ["berlin"] },
  { country: "德国", zh: "慕尼黑", aliases: ["munich"] },
  { country: "德国", zh: "杜塞尔多夫", aliases: ["dusseldorf"] },
  { country: "德国", zh: "汉堡", aliases: ["hamburg"] },
  { country: "法国", zh: "巴黎", aliases: ["paris"] },
  { country: "法国", zh: "马赛", aliases: ["marseille"] },
  { country: "法国", zh: "里昂", aliases: ["lyon"] },
  { country: "意大利", zh: "罗马", aliases: ["rome"] },
  { country: "意大利", zh: "米兰", aliases: ["milan"] },
  { country: "意大利", zh: "那不勒斯", aliases: ["naples"] },
  { country: "西班牙", zh: "马德里", aliases: ["madrid"] },
  { country: "西班牙", zh: "巴塞罗那", aliases: ["barcelona"] },
  { country: "西班牙", zh: "瓦伦西亚", aliases: ["valencia"] },
  { country: "葡萄牙", zh: "里斯本", aliases: ["lisbon"] },
  { country: "葡萄牙", zh: "波尔图", aliases: ["porto"] },
  { country: "荷兰", zh: "阿姆斯特丹", aliases: ["amsterdam"] },
  { country: "荷兰", zh: "鹿特丹", aliases: ["rotterdam"] },
  { country: "瑞士", zh: "苏黎世", aliases: ["zurich"] },
  { country: "瑞士", zh: "日内瓦", aliases: ["geneva"] },
  { country: "瑞典", zh: "斯德哥尔摩", aliases: ["stockholm"] },
  { country: "瑞典", zh: "哥德堡", aliases: ["gothenburg"] },
  { country: "冰岛", zh: "雷克雅未克", aliases: ["reykjavik"] },
  { country: "挪威", zh: "奥斯陆", aliases: ["oslo"] },
  { country: "挪威", zh: "卑尔根", aliases: ["bergen"] },
  { country: "芬兰", zh: "赫尔辛基", aliases: ["helsinki"] },
  { country: "丹麦", zh: "哥本哈根", aliases: ["copenhagen"] },
  { country: "比利时", zh: "布鲁塞尔", aliases: ["brussels"] },
  { country: "奥地利", zh: "维也纳", aliases: ["vienna"] },
  { country: "爱尔兰", zh: "都柏林", aliases: ["dublin"] },
  { country: "波兰", zh: "华沙", aliases: ["warsaw"] },
  { country: "捷克", zh: "布拉格", aliases: ["prague"] },
  { country: "匈牙利", zh: "布达佩斯", aliases: ["budapest"] },
  { country: "罗马尼亚", zh: "布加勒斯特", aliases: ["bucharest"] },
  { country: "希腊", zh: "雅典", aliases: ["athens"] },
  { country: "保加利亚", zh: "索非亚", aliases: ["sofia"] },
  { country: "俄罗斯", zh: "莫斯科", aliases: ["moscow"] },
  { country: "俄罗斯", zh: "圣彼得堡", aliases: [["saint", "petersburg"], ["st", "petersburg"]] },
  { country: "乌克兰", zh: "基辅", aliases: ["kyiv", "kiev"] },
  { country: "美国", zh: "洛杉矶", aliases: [["los", "angeles"]] },
  { country: "美国", zh: "圣何塞", aliases: [["san", "jose"]] },
  { country: "美国", zh: "纽约", aliases: [["new", "york"]] },
  { country: "美国", zh: "拉斯维加斯", aliases: [["las", "vegas"]] },
  { country: "美国", zh: "硅谷", aliases: [["silicon", "valley"]] },
  { country: "美国", zh: "西雅图", aliases: ["seattle"] },
  { country: "美国", zh: "芝加哥", aliases: ["chicago"] },
  { country: "美国", zh: "达拉斯", aliases: ["dallas"] },
  { country: "美国", zh: "迈阿密", aliases: ["miami"] },
  { country: "美国", zh: "凤凰城", aliases: ["phoenix"] },
  { country: "美国", zh: "亚特兰大", aliases: ["atlanta"] },
  { country: "美国", zh: "阿什本", aliases: ["ashburn"] },
  { country: "美国", zh: "旧金山", aliases: [["san", "francisco"]] },
  { country: "美国", zh: "华盛顿", aliases: ["washington", ["washington", "dc"]] },
  { country: "美国", zh: "波特兰", aliases: ["portland"] },
  { country: "美国", zh: "休斯顿", aliases: ["houston"] },
  { country: "美国", zh: "丹佛", aliases: ["denver"] },
  { country: "美国", zh: "费利蒙", aliases: ["fremont"] },
  { country: "美国", zh: "圣克拉拉", aliases: [["santa", "clara"]] },
  { country: "美国", zh: "波士顿", aliases: ["boston"] },
  { country: "加拿大", zh: "多伦多", aliases: ["toronto"] },
  { country: "加拿大", zh: "温哥华", aliases: ["vancouver"] },
  { country: "加拿大", zh: "蒙特利尔", aliases: ["montreal"] },
  { country: "加拿大", zh: "渥太华", aliases: ["ottawa"] },
  { country: "加拿大", zh: "卡尔加里", aliases: ["calgary"] },
  { country: "墨西哥", zh: "墨西哥城", aliases: [["mexico", "city"]] },
  { country: "墨西哥", zh: "瓜达拉哈拉", aliases: ["guadalajara"] },
  { country: "巴西", zh: "圣保罗", aliases: [["sao", "paulo"]] },
  { country: "巴西", zh: "里约热内卢", aliases: [["rio", "de", "janeiro"]] },
  { country: "阿根廷", zh: "布宜诺斯艾利斯", aliases: [["buenos", "aires"]] },
  { country: "智利", zh: "圣地亚哥", aliases: ["santiago"] },
  { country: "哥伦比亚", zh: "波哥大", aliases: ["bogota"] },
  { country: "秘鲁", zh: "利马", aliases: ["lima"] },
  { country: "澳大利亚", zh: "悉尼", aliases: ["sydney"] },
  { country: "澳大利亚", zh: "墨尔本", aliases: ["melbourne"] },
  { country: "澳大利亚", zh: "布里斯班", aliases: ["brisbane"] },
  { country: "澳大利亚", zh: "珀斯", aliases: ["perth"] },
  { country: "新西兰", zh: "奥克兰", aliases: ["auckland"] },
  { country: "新西兰", zh: "惠灵顿", aliases: ["wellington"] },
  { country: "新西兰", zh: "基督城", aliases: ["christchurch"] },
  { country: "南非", zh: "约翰内斯堡", aliases: ["johannesburg"] },
  { country: "南非", zh: "开普敦", aliases: [["cape", "town"]] },
  { country: "尼日利亚", zh: "拉各斯", aliases: ["lagos"] },
  { country: "尼日利亚", zh: "阿布贾", aliases: ["abuja"] },
  { country: "埃及", zh: "开罗", aliases: ["cairo"] },
]);

const LOCATION_RULES = buildLocationRules([
  // 中国港澳台与东亚
  {
    zh: "香港",
    aliases: [
      ["hong", "kong"],
      "kowloon",
      "hk",
      "hkg",
    ],
  },
  {
    zh: "澳门",
    aliases: [
      "macau",
      "macao",
    ],
  },
  {
    zh: "台湾",
    aliases: [
      "taiwan",
      ["tai", "wan"],
      ["tai", "pei"],
      ["kaoh", "siung"],
      ["tai", "chung"],
      "taipei",
      "kaohsiung",
      "taichung",
      "hsinchu",
      "tw",
      "twn",
    ],
  },
  {
    zh: "中国",
    aliases: [
      "china",
      ["main", "land"],
      "mainland",
      "beijing",
      "shanghai",
      "guangzhou",
      "shenzhen",
      "hangzhou",
      "chengdu",
      "nanjing",
      "wuhan",
      "xiamen",
      "chn",
    ],
  },
  {
    zh: "日本",
    aliases: [
      "japan",
      "tokyo",
      "osaka",
      "yokohama",
      "nagoya",
      "kyoto",
      "fukuoka",
      "sapporo",
      "jp",
      "jpn",
    ],
  },
  {
    zh: "韩国",
    aliases: [
      ["south", "korea"],
      ["republic", "of", "korea"],
      ["korea", "republic"],
      "southkorea",
      "korea",
      "seoul",
      "busan",
      "incheon",
      "kr",
      "kor",
    ],
  },

  // 东南亚、南亚、中亚与中东
  {
    zh: "新加坡",
    aliases: [
      "singapore",
      ["singa", "pore"],
      "sg",
      "sgp",
    ],
  },
  {
    zh: "马来西亚",
    aliases: [
      "malaysia",
      ["kuala", "lumpur"],
      "kualalumpur",
      "penang",
      "johor",
      "mys",
    ],
  },
  {
    zh: "泰国",
    aliases: [
      "thailand",
      "bangkok",
      "thai",
      "tha",
    ],
  },
  {
    zh: "菲律宾",
    aliases: [
      "philippines",
      "manila",
      "phl",
    ],
  },
  {
    zh: "越南",
    aliases: [
      "vietnam",
      ["ho", "chi", "minh"],
      "hochiminh",
      "saigon",
      "hanoi",
      "vnm",
    ],
  },
  {
    zh: "印度",
    aliases: [
      "india",
      "mumbai",
      "delhi",
      "bangalore",
      "bengaluru",
      "hyderabad",
      "chennai",
      "kolkata",
      "ind",
    ],
  },
  {
    zh: "孟加拉国",
    aliases: [
      "bangladesh",
      "dhaka",
      "bgd",
    ],
  },
  {
    zh: "印度尼西亚",
    aliases: [
      "indonesia",
      "jakarta",
      "surabaya",
      "idn",
    ],
  },
  {
    zh: "阿联酋",
    aliases: [
      ["united", "arab", "emirates"],
      "unitedarabemirates",
      "uae",
      "dubai",
      ["abu", "dhabi"],
      "abudhabi",
    ],
  },
  {
    zh: "沙特阿拉伯",
    aliases: [
      ["saudi", "arabia"],
      "saudiarabia",
      "riyadh",
      "jeddah",
      "sau",
    ],
  },
  {
    zh: "卡塔尔",
    aliases: [
      "qatar",
      "doha",
      "qat",
    ],
  },
  {
    zh: "哈萨克斯坦",
    aliases: [
      "kazakhstan",
      "astana",
      "almaty",
      ["nur", "sultan"],
      "nursultan",
      "kaz",
    ],
  },
  {
    zh: "以色列",
    aliases: [
      "israel",
      ["tel", "aviv"],
      "telaviv",
      "jerusalem",
      "isr",
    ],
  },
  {
    zh: "土耳其",
    aliases: [
      "turkey",
      "turkiye",
      "istanbul",
      "ankara",
      "tur",
    ],
  },

  // 欧洲
  {
    zh: "英国",
    aliases: [
      ["united", "kingdom"],
      ["u", "k"],
      "unitedkingdom",
      "britain",
      "england",
      "london",
      "manchester",
      "birmingham",
      "uk",
      "gb",
      "gbr",
    ],
  },
  {
    zh: "德国",
    aliases: [
      "germany",
      "frankfurt",
      "berlin",
      "munich",
      "dusseldorf",
      "hamburg",
      "de",
      "deu",
    ],
  },
  {
    zh: "法国",
    aliases: [
      "france",
      "paris",
      "marseille",
      "lyon",
      "fr",
    ],
  },
  {
    zh: "意大利",
    aliases: [
      "italy",
      "rome",
      "milan",
      "naples",
      "ita",
    ],
  },
  {
    zh: "西班牙",
    aliases: [
      "spain",
      "madrid",
      "barcelona",
      "valencia",
      "esp",
    ],
  },
  {
    zh: "葡萄牙",
    aliases: [
      "portugal",
      "lisbon",
      "porto",
      "prt",
    ],
  },
  {
    zh: "荷兰",
    aliases: [
      "netherlands",
      "holland",
      "amsterdam",
      "rotterdam",
      "nld",
    ],
  },
  {
    zh: "瑞士",
    aliases: [
      "switzerland",
      "zurich",
      "geneva",
      "sui",
      "che",
    ],
  },
  {
    zh: "瑞典",
    aliases: [
      "sweden",
      "stockholm",
      "gothenburg",
      "swe",
    ],
  },
  {
    zh: "冰岛",
    aliases: [
      "iceland",
      "reykjavik",
      "isl",
    ],
  },
  {
    zh: "挪威",
    aliases: [
      "norway",
      "oslo",
      "bergen",
      "nor",
    ],
  },
  {
    zh: "芬兰",
    aliases: [
      "finland",
      "helsinki",
      "fin",
    ],
  },
  {
    zh: "丹麦",
    aliases: [
      "denmark",
      "copenhagen",
      "dnk",
    ],
  },
  {
    zh: "比利时",
    aliases: [
      "belgium",
      "brussels",
      "bel",
    ],
  },
  {
    zh: "奥地利",
    aliases: [
      "austria",
      "vienna",
      "aut",
    ],
  },
  {
    zh: "爱尔兰",
    aliases: [
      "ireland",
      "dublin",
      "irl",
    ],
  },
  {
    zh: "卢森堡",
    aliases: [
      "luxembourg",
      "luxemburg",
      "lux",
    ],
  },
  {
    zh: "波兰",
    aliases: [
      "poland",
      "warsaw",
      "pol",
    ],
  },
  {
    zh: "捷克",
    aliases: [
      ["czech", "republic"],
      "czechrepublic",
      "czechia",
      "czech",
      "prague",
      "cze",
    ],
  },
  {
    zh: "匈牙利",
    aliases: [
      "hungary",
      "budapest",
      "hun",
    ],
  },
  {
    zh: "罗马尼亚",
    aliases: [
      "romania",
      "bucharest",
      "rou",
    ],
  },
  {
    zh: "希腊",
    aliases: [
      "greece",
      "athens",
      "grc",
    ],
  },
  {
    zh: "保加利亚",
    aliases: [
      "bulgaria",
      "sofia",
      "bgr",
    ],
  },
  {
    zh: "俄罗斯",
    aliases: [
      "russia",
      "moscow",
      ["saint", "petersburg"],
      ["st", "petersburg"],
      "saintpetersburg",
      "stpetersburg",
      "rus",
    ],
  },
  {
    zh: "乌克兰",
    aliases: [
      "ukraine",
      "kyiv",
      "kiev",
      "ukr",
    ],
  },

  // 北美与南美
  {
    zh: "美国",
    aliases: [
      ["united", "states"],
      ["united", "states", "of", "america"],
      ["u", "s", "a"],
      ["u", "s"],
      "usa",
      "us",
      ["los", "angeles"],
      ["san", "jose"],
      ["new", "york"],
      ["las", "vegas"],
      ["silicon", "valley"],
      "losangeles",
      "sanjose",
      "newyork",
      "lasvegas",
      "siliconvalley",
      "seattle",
      "chicago",
      "dallas",
      "miami",
      "phoenix",
      "atlanta",
      "ashburn",
    ],
  },
  {
    zh: "加拿大",
    aliases: [
      "canada",
      "toronto",
      "vancouver",
      "montreal",
      "ottawa",
      "calgary",
      "can",
    ],
  },
  {
    zh: "墨西哥",
    aliases: [
      "mexico",
      ["mexico", "city"],
      "mexicocity",
      "guadalajara",
      "mex",
    ],
  },
  {
    zh: "巴西",
    aliases: [
      "brazil",
      ["sao", "paulo"],
      ["rio", "de", "janeiro"],
      "saopaulo",
      "riodejaneiro",
      "bra",
    ],
  },
  {
    zh: "阿根廷",
    aliases: [
      "argentina",
      ["buenos", "aires"],
      "buenosaires",
      "arg",
    ],
  },
  {
    zh: "智利",
    aliases: [
      "chile",
      "santiago",
      "chl",
    ],
  },
  {
    zh: "哥伦比亚",
    aliases: [
      "colombia",
      "bogota",
      "col",
    ],
  },
  {
    zh: "秘鲁",
    aliases: [
      "peru",
      "lima",
      "per",
    ],
  },

  // 大洋洲与非洲
  {
    zh: "澳大利亚",
    aliases: [
      "australia",
      "sydney",
      "melbourne",
      "brisbane",
      "perth",
      "au",
      "aus",
    ],
  },
  {
    zh: "新西兰",
    aliases: [
      ["new", "zealand"],
      "newzealand",
      "auckland",
      "wellington",
      "christchurch",
      "nz",
      "nzl",
    ],
  },
  {
    zh: "南非",
    aliases: [
      ["south", "africa"],
      "southafrica",
      "johannesburg",
      ["cape", "town"],
      "capetown",
      "zaf",
    ],
  },
  {
    zh: "尼日利亚",
    aliases: [
      "nigeria",
      "lagos",
      "abuja",
      "nga",
    ],
  },
  {
    zh: "埃及",
    aliases: [
      "egypt",
      "cairo",
      "egy",
    ],
  },

  // 区域标签
  {
    zh: "欧洲",
    aliases: [
      "europe",
      "european",
    ],
  },
  {
    zh: "亚洲",
    aliases: [
      "asia",
      ["asia", "pacific"],
      "asiapacific",
      "apac",
    ],
  },
  {
    zh: "中东",
    aliases: [
      ["middle", "east"],
      "middleeast",
    ],
  },
  {
    zh: "北美",
    aliases: [
      ["north", "america"],
      "northamerica",
    ],
  },
  {
    zh: "南美",
    aliases: [
      ["south", "america"],
      "southamerica",
      ["latin", "america"],
      "latinamerica",
      "latam",
    ],
  },
]);

function operator(proxies = [], targetPlatform, context) {
  void targetPlatform;
  void context;

  if (!Array.isArray(proxies)) {
    return [];
  }

  return proxies.map((proxy) => renameProxy(proxy));
}

function renameProxy(proxy) {
  if (!proxy || typeof proxy.name !== "string") {
    return proxy;
  }

  const renamedName = renameLocationInName(proxy.name);
  if (renamedName === proxy.name) {
    return proxy;
  }

  return {
    ...proxy,
    name: renamedName,
  };
}

function renameLocationInName(name) {
  let result = normalizeChineseLocationNames(cleanupName(String(name)));
  let detectedCountry = findCountryInChineseName(result);

  for (const rule of CITY_RULES) {
    const next = result.replace(rule.re, (_, prefix) => `${prefix}${rule.zh}`);
    if (next === result) {
      continue;
    }

    result = next;
    detectedCountry ||= rule.country;
  }

  result = replaceStandaloneShortCode(result);

  for (const rule of LOCATION_RULES) {
    if (rule.standaloneCodeRe) {
      const collapsed = result.replace(rule.standaloneCodeRe, (_, prefix) => `${prefix}${rule.zh}`);
      if (collapsed !== result) {
        result = collapseDuplicateLocation(collapsed, rule.zh);
        if (LOCATION_FLAGS[rule.zh]) {
          detectedCountry ||= rule.zh;
        }
      }
    }

    if (rule.codeAliasRe) {
      const collapsed = result.replace(rule.codeAliasRe, (_, prefix) => `${prefix}${rule.zh}`);
      if (collapsed !== result) {
        result = collapseDuplicateLocation(collapsed, rule.zh);
        if (LOCATION_FLAGS[rule.zh]) {
          detectedCountry ||= rule.zh;
        }
      }
    }

    const next = result.replace(rule.re, (_, prefix) => `${prefix}${rule.zh}`);
    if (next === result) {
      continue;
    }

    result = collapseDuplicateLocation(next, rule.zh);
    if (LOCATION_FLAGS[rule.zh]) {
      detectedCountry ||= rule.zh;
    }
  }

  // North/South/Latin America 已由区域规则优先转换，此处只处理单独出现的 America。
  const americaLocalized = result.replace(
    STANDALONE_AMERICA_RE,
    (_, prefix) => `${prefix}美国`
  );
  if (americaLocalized !== result) {
    result = collapseDuplicateLocation(americaLocalized, "美国");
    detectedCountry ||= "美国";
  }

  result = cleanupName(result);
  detectedCountry = findCountryInChineseName(result) || detectedCountry;
  return normalizeLeadingFlag(result, detectedCountry);
}

function collapseDuplicateLocation(name, location) {
  const duplicateRe = new RegExp(
    `(${escapeRegex(location)})(?:[\\s._\\-/|()\\[\\]]*\\1)+`,
    "g"
  );

  return name.replace(duplicateRe, "$1");
}

function cleanupName(name) {
  return name.replace(/\s{2,}/g, " ").trim();
}

function normalizeChineseLocationNames(name) {
  let result = name;

  for (const [traditional, simplified] of SIMPLIFIED_NAME_REPLACEMENTS) {
    result = result.split(traditional).join(simplified);
  }

  return result;
}

function buildLocationRules(rules) {
  return rules.map((rule) => ({
    zh: rule.zh,
    shortCodes: (LOCATION_CODES[rule.zh] || []).filter((code) => code.length === 2),
    standaloneCodeRe: buildStandaloneCodeRegex(LOCATION_CODES[rule.zh]),
    codeAliasRe: buildCodeAliasRegex(LOCATION_CODES[rule.zh], rule.aliases),
    re: buildLocationRegex(rule.aliases),
  }));
}

function buildCityRules(rules) {
  return rules.map((rule) => ({
    ...rule,
    re: buildLocationRegex(rule.aliases),
  }));
}

function replaceStandaloneShortCode(name) {
  const flagMatch = name.match(LEADING_FLAG_RE);
  const prefix = flagMatch ? flagMatch[0] : "";
  const body = flagMatch ? name.slice(flagMatch[0].length) : name;
  const trimmedBody = body.trimStart();
  const leadingWhitespace = body.slice(0, body.length - trimmedBody.length);

  for (const rule of LOCATION_RULES) {
    if (!Array.isArray(rule.shortCodes) || rule.shortCodes.length === 0) {
      continue;
    }

    for (const code of rule.shortCodes) {
      const codeRe = new RegExp(`^${escapeRegex(code)}(?=$|[^A-Za-z])`, "i");
      const match = trimmedBody.match(codeRe);
      if (!match) {
        continue;
      }

      const rest = trimmedBody.slice(match[0].length);
      if (/[A-Za-z]/.test(rest)) {
        continue;
      }

      return `${prefix}${leadingWhitespace}${trimmedBody.replace(codeRe, rule.zh)}`;
    }
  }

  return name;
}

function buildLocationRegex(aliases) {
  const sources = aliases
    .map(buildAliasPattern)
    .sort((left, right) => right.length - left.length);

  return new RegExp(`(^|[^A-Za-z])(${sources.join("|")})(?=$|[^A-Za-z])`, "gi");
}

function buildCodeAliasRegex(codes, aliases) {
  if (!Array.isArray(codes) || codes.length === 0) {
    return null;
  }

  const codeSources = codes
    .map(escapeRegex)
    .sort((left, right) => right.length - left.length);

  const aliasSources = aliases
    .map(buildAliasPattern)
    .sort((left, right) => right.length - left.length);

  return new RegExp(
    `(^|[^A-Za-z])(?:${codeSources.join("|")})${SEPARATOR_PATTERN}(?:${aliasSources.join("|")})(?=$|[^A-Za-z])`,
    "gi"
  );
}

function buildStandaloneCodeRegex(codes) {
  if (!Array.isArray(codes) || codes.length === 0) {
    return null;
  }

  const codeSources = codes
    .filter((code) => code.length >= 3)
    .map(escapeRegex)
    .sort((left, right) => right.length - left.length);

  if (codeSources.length === 0) {
    return null;
  }

  return new RegExp(`(^|[^A-Za-z])(?:${codeSources.join("|")})(?=$|[^A-Za-z])`, "gi");
}

function normalizeLeadingFlag(name, country) {
  const canonicalFlag = LOCATION_FLAGS[country] || findCanonicalFlag(name);
  if (!canonicalFlag) {
    return name;
  }

  let body = cleanupName(name.replace(LEADING_FLAG_RE, ""));
  const providerPrefixMatch = body.match(PROVIDER_PREFIX_RE);
  const providerPrefix = providerPrefixMatch
    ? providerPrefixMatch[0].trimEnd()
    : "";

  if (providerPrefixMatch) {
    body = body.slice(providerPrefixMatch[0].length);
  }

  body = cleanupName(body.replace(LEADING_FLAG_RE, ""));
  const normalizedBody = body ? `${canonicalFlag} ${body}` : canonicalFlag;
  return providerPrefix ? `${providerPrefix}${normalizedBody}` : normalizedBody;
}

function findCanonicalFlag(name) {
  const country = findCountryInChineseName(name);
  return country ? LOCATION_FLAGS[country] : null;
}

function findCountryInChineseName(name) {
  let detectedCountry = null;
  let firstIndex = Infinity;

  for (const country of Object.keys(LOCATION_FLAGS)) {
    const index = name.indexOf(country);
    const isEarlier = index !== -1 && index < firstIndex;
    const isMoreSpecificAtSamePosition =
      index !== -1 &&
      index === firstIndex &&
      (!detectedCountry || country.length > detectedCountry.length);

    if (isEarlier || isMoreSpecificAtSamePosition) {
      detectedCountry = country;
      firstIndex = index;
    }
  }

  return detectedCountry;
}

function buildAliasPattern(alias) {
  if (Array.isArray(alias)) {
    return createTokenSequencePattern(alias);
  }

  return createSingleTokenPattern(alias);
}

function createTokenSequencePattern(tokens) {
  const escapedTokens = tokens.map(escapeRegex);
  const sequence = escapedTokens.join(SEPARATOR_PATTERN);
  return tokens.every((token) => token.length === 1)
    ? `${sequence}\\.?`
    : sequence;
}

function createSingleTokenPattern(token) {
  const escapedToken = escapeRegex(token);
  return escapedToken;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
