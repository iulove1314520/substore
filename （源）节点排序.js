/**
 * 节点排序规则脚本
 * 功能：按照优先级对节点进行排序
 * 版本：1.2.0
 * 排序逻辑：
 * 1. 按照预定义的优先级规则依次匹配节点名称
 * 2. 匹配到规则的节点优先级更高
 * 3. 对于倍率节点，倍率越低排序越靠前
 * 4. 如果都不匹配任何规则，则按字母顺序排序（中文使用中文排序）
 */
function operator(proxies, targetPlatform) {
  return proxies.sort((a, b) => {
    // 如果名称为空，直接返回
    if (!a.name || !b.name) return 0;
    
    // 首先检查是否为倍率节点，并提取倍率值
    const aMultiplierMatch = a.name.match(/(\d+\.\d+)[xX]/i);
    const bMultiplierMatch = b.name.match(/(\d+\.\d+)[xX]/i);
    
    // 如果两个节点都有倍率，按倍率从低到高排序
    if (aMultiplierMatch && bMultiplierMatch) {
      const aMultiplier = parseFloat(aMultiplierMatch[1]);
      const bMultiplier = parseFloat(bMultiplierMatch[1]);
      if (aMultiplier !== bMultiplier) {
        return aMultiplier - bMultiplier; // 倍率低的排前面
      }
    }
    
    // 遍历所有排序规则
    for (let i = 0; i < sortPatterns.length; i++) {
      const pattern = sortPatterns[i];
      const aMatch = pattern.test(a.name);
      const bMatch = pattern.test(b.name);
      
      // 如果两个节点都匹配或都不匹配当前规则，继续检查下一个规则
      if (aMatch === bMatch) continue;
      
      // 匹配规则的节点优先（返回-1表示a排在b前面）
      return aMatch ? -1 : 1;
    }
    
    // 提取数字部分并进行数值比较
    const aNum = parseInt(a.name.match(/\d+/) ? a.name.match(/\d+/)[0] : 0, 10);
    const bNum = parseInt(b.name.match(/\d+/) ? b.name.match(/\d+/)[0] : 0, 10);
    
    if (aNum !== bNum) {
      return aNum - bNum;
    }
    
    // 如果没有匹配任何规则，按照节点名称字母顺序排序
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    
    // 处理中文排序
    if (aName.match(/[\u4e00-\u9fa5]/) && bName.match(/[\u4e00-\u9fa5]/)) {
      return aName.localeCompare(bName, 'zh-CN');
    }
    
    // 处理英文和其他字符排序
    return aName.localeCompare(bName, 'en');
  });
}

// 排序优先级定义
const sortPatterns = [
  // 第一级：特殊类型节点优先级
  /活动|优惠|限时/i,                             // 1.1 活动和优惠节点最优先
  /直连|直通/i,                                  // 1.2 直连节点次优先
  /官网/i,                                       // 1.3 官网节点
  /套餐/i,                                       // 1.4 套餐节点
  /流量/i,                                       // 1.5 流量节点
  /重置/i,                                       // 1.6 重置节点
  /Game|游戏|加速/i,                             // 5.2 游戏节点

  // 2. 倍率优先级 (从低到高)
  /\|\s*0\.1x/i,                               // 2.1 0.1倍率节点
  /\|\s*0\.2x/i,                               // 2.2 0.2倍率节点
  /\|\s*0\.3x/i,                               // 2.3 0.3倍率节点
  /\|\s*0\.4x/i,                               // 2.4 0.4倍率节点
  /\|\s*0\.5x/i,                               // 2.5 0.5倍率节点
  /\|\s*0\.6x/i,                               // 2.6 0.6倍率节点
  /\|\s*0\.7x/i,                               // 2.7 0.7倍率节点
  /\|\s*0\.8x/i,                               // 2.8 0.8倍率节点
  /\|\s*0\.9x/i,                               // 2.9 0.9倍率节点
  /\|\s*0\.\s*[123456789]X/i,                  // 2.10 低倍率通用匹配
  /(?:x|X)\s*0\.[123456789]\d*/i,              // 2.11 x 0.xx格式的低倍率
  /\s+x\s+0\.[123456789]\d*/i,                 // 2.12 空格x空格0.xx格式的低倍率
  /EX/i,                                    // 2.13 低倍率标记
  /0\.\d+\s*[xX]/i,                           // 2.14 小数倍率
  /实验性/i,                                    // 2.15 实验性节点
  
  // 第三级：主要地区优先级
  /香港\b|HK\b|Hong Kong\b|港(?!澳)|(?<![A-Za-z0-9-])(HKG|HKBN|HKIX|HGC|WTT|CMI)(?![A-Za-z0-9-])/i,  // 3.1 香港节点
  /澳门\b|Macau\b|Macao\b|澳(?!大利亚)|(?<![A-Za-z0-9-])MO(?![A-Za-z0-9-])/i,  // 3.2 澳门节点
  /台湾\b|TW\b|Taiwan\b|台(?!风)|(?<![A-Za-z0-9-])(Hinet|TWN|CHT|HINET|TFN)(?![A-Za-z0-9-])/i,  // 3.3 台湾节点
  /日本\b|JP\b|Tokyo\b|Osaka\b|Japan\b|日(?!利亚)|(?<![A-Za-z0-9-])(JPN|NTT|IIJ|KDDI)(?![A-Za-z0-9-])/i,  // 3.4 日本节点
  /新加坡\b|SG\b|Singapore\b|狮城\b|新(?!西兰)|(?<![A-Za-z0-9-])(SGP|SingTel|M1|StarHub)(?![A-Za-z0-9-])/i,  // 3.5 新加坡节点
  /美国\b|US\b|USA\b|United States\b|美(?!洲)|(?<![A-Za-z0-9-])(AWS|GIA)(?![A-Za-z0-9-])/i,  // 3.6 美国节点

  // 第四级：次要地区优先级（按亚洲、澳洲、欧洲、美洲、非洲顺序）
  // 亚洲地区
  /韩国\b|KR\b|South Korea\b|首尔\b|韩(?!剧)|(?<![A-Za-z0-9-])(KOR|SKT|KT|LG)(?![A-Za-z0-9-])/i,  // 4.1.1 韩国节点
  /马来西亚\b|MY\b|Malaysia\b|大马\b|(?<![A-Za-z0-9-])MYS(?![A-Za-z0-9-])/i,  // 4.1.2 马来西亚节点
  /泰国\b|TH\b|Thailand\b|曼谷\b|(?<![A-Za-z0-9-])THA(?![A-Za-z0-9-])/i,  // 4.1.3 泰国节点
  /菲律宾\b|PH\b|Philippines\b|马尼拉\b|(?<![A-Za-z0-9-])PHL(?![A-Za-z0-9-])/i,  // 4.1.4 菲律宾节点
  
  // 澳洲地区
  /澳大利亚\b|AU\b|悉尼\b|墨尔本\b|布里斯班\b|(?<![A-Za-z0-9-])AUS(?![A-Za-z0-9-])/i,  // 4.2.1 澳大利亚节点
  
  // 欧洲地区
  /英国\b|UK\b|伦敦\b|曼彻斯特\b|(?<![A-Za-z0-9-])(GBR|BT)(?![A-Za-z0-9-])(?!.*\bVideotron\b)/i,  // 4.3.1 英国节点
  /德国\b|DE\b|Germany\b|法兰克福\b|柏林\b|(?<![A-Za-z0-9-])DEU(?![A-Za-z0-9-])(?!.*\bVideotron\b)/i,  // 4.3.2 德国节点
  /法国\b|FR\b|France\b|巴黎\b|马赛\b|(?<![A-Za-z0-9-])FRA(?![A-Za-z0-9-])/i,  // 4.3.3 法国节点
  
  // 美洲地区
  /加拿大\b|CA\b|Canada\b|多伦多\b|温哥华\b|蒙特利尔\b|(?<![A-Za-z0-9-])CAN(?![A-Za-z0-9-])/i,  // 4.4.1 加拿大节点
  /阿根廷\b|AR\b|Argentina\b|布宜诺斯艾利斯\b|阿(?!(根廷|联酋|塞拜疆))|(?<![A-Za-z0-9-])(ARG|Claro|Telecom)(?![A-Za-z0-9-])/i,  // 4.4.2 阿根廷节点

]; 