// GENERATED FILE -- do not edit by hand. Regenerate with scripts/gen-case-fold-table.mjs.
//
// The FULL Unicode DEFAULT case-fold map from `unicode-case-folding@1.1.1`, the exact library
// quest-cli's `aliasKey` calls. Each line is one entry, `<code point><fold output>`, ascending by
// code point; a newline separates entries, and a fold output may be several code points (`ss`, a
// Greek iota subscript, an Armenian ligature, ...). A code point ABSENT from the table folds to
// itself, which is the library's own semantics -- the reader applies NO `String.prototype.toLowerCase`
// fallback, so the result does not vary by Bun generation (DEC-282 (a12)). lore and quest share this
// one fold table; a change to it is a pair change, and the digest pin in
// test/lcli791-quest-rollup.test.ts fails in whichever half lags.
//
// entries: 1585
// sha256 of the newline-joined data below: ef08b22d969b928737ae158c7a0d2bc4b800769b178f99db69f21bd68255fc13
export const CASE_FOLD_TABLE_DATA =
  "Aa\nBb\nCc\nDd\nEe\nFf\nGg\nHh\nIi\nJj\nKk\nLl\nMm\nNn\nOo\nPp\nQq\nRr\nSs\nTt\nUu\nVv\nWw\nXx\nYy\nZz\nµμ\nÀà\nÁá\nÂâ\nÃã\nÄä\nÅå\nÆæ\nÇç\nÈè\nÉé\n" +
  "Êê\nËë\nÌì\nÍí\nÎî\nÏï\nÐð\nÑñ\nÒò\nÓó\nÔô\nÕõ\nÖö\nØø\nÙù\nÚú\nÛû\nÜü\nÝý\nÞþ\nßss\nĀā\nĂă\nĄą\nĆć\nĈĉ\nĊċ\nČč\nĎď\nĐđ\nĒē\nĔĕ\nĖė\nĘę\nĚě\nĜĝ\n" +
  "Ğğ\nĠġ\nĢģ\nĤĥ\nĦħ\nĨĩ\nĪī\nĬĭ\nĮį\nİi̇\nĲĳ\nĴĵ\nĶķ\nĹĺ\nĻļ\nĽľ\nĿŀ\nŁł\nŃń\nŅņ\nŇň\nŉʼn\nŊŋ\nŌō\nŎŏ\nŐő\nŒœ\nŔŕ\nŖŗ\nŘř\nŚś\nŜŝ\nŞş\nŠš\nŢţ\nŤť\n" +
  "Ŧŧ\nŨũ\nŪū\nŬŭ\nŮů\nŰű\nŲų\nŴŵ\nŶŷ\nŸÿ\nŹź\nŻż\nŽž\nſs\nƁɓ\nƂƃ\nƄƅ\nƆɔ\nƇƈ\nƉɖ\nƊɗ\nƋƌ\nƎǝ\nƏə\nƐɛ\nƑƒ\nƓɠ\nƔɣ\nƖɩ\nƗɨ\nƘƙ\nƜɯ\nƝɲ\nƟɵ\nƠơ\nƢƣ\n" +
  "Ƥƥ\nƦʀ\nƧƨ\nƩʃ\nƬƭ\nƮʈ\nƯư\nƱʊ\nƲʋ\nƳƴ\nƵƶ\nƷʒ\nƸƹ\nƼƽ\nǄǆ\nǅǆ\nǇǉ\nǈǉ\nǊǌ\nǋǌ\nǍǎ\nǏǐ\nǑǒ\nǓǔ\nǕǖ\nǗǘ\nǙǚ\nǛǜ\nǞǟ\nǠǡ\nǢǣ\nǤǥ\nǦǧ\nǨǩ\nǪǫ\nǬǭ\n" +
  "Ǯǯ\nǰǰ\nǱǳ\nǲǳ\nǴǵ\nǶƕ\nǷƿ\nǸǹ\nǺǻ\nǼǽ\nǾǿ\nȀȁ\nȂȃ\nȄȅ\nȆȇ\nȈȉ\nȊȋ\nȌȍ\nȎȏ\nȐȑ\nȒȓ\nȔȕ\nȖȗ\nȘș\nȚț\nȜȝ\nȞȟ\nȠƞ\nȢȣ\nȤȥ\nȦȧ\nȨȩ\nȪȫ\nȬȭ\nȮȯ\nȰȱ\n" +
  "Ȳȳ\nȺⱥ\nȻȼ\nȽƚ\nȾⱦ\nɁɂ\nɃƀ\nɄʉ\nɅʌ\nɆɇ\nɈɉ\nɊɋ\nɌɍ\nɎɏ\nͅι\nͰͱ\nͲͳ\nͶͷ\nͿϳ\nΆά\nΈέ\nΉή\nΊί\nΌό\nΎύ\nΏώ\nΐΐ\nΑα\nΒβ\nΓγ\nΔδ\nΕε\nΖζ\nΗη\nΘθ\nΙι\n" +
  "Κκ\nΛλ\nΜμ\nΝν\nΞξ\nΟο\nΠπ\nΡρ\nΣσ\nΤτ\nΥυ\nΦφ\nΧχ\nΨψ\nΩω\nΪϊ\nΫϋ\nΰΰ\nςσ\nϏϗ\nϐβ\nϑθ\nϕφ\nϖπ\nϘϙ\nϚϛ\nϜϝ\nϞϟ\nϠϡ\nϢϣ\nϤϥ\nϦϧ\nϨϩ\nϪϫ\nϬϭ\nϮϯ\n" +
  "ϰκ\nϱρ\nϴθ\nϵε\nϷϸ\nϹϲ\nϺϻ\nϽͻ\nϾͼ\nϿͽ\nЀѐ\nЁё\nЂђ\nЃѓ\nЄє\nЅѕ\nІі\nЇї\nЈј\nЉљ\nЊњ\nЋћ\nЌќ\nЍѝ\nЎў\nЏџ\nАа\nБб\nВв\nГг\nДд\nЕе\nЖж\nЗз\nИи\nЙй\n" +
  "Кк\nЛл\nМм\nНн\nОо\nПп\nРр\nСс\nТт\nУу\nФф\nХх\nЦц\nЧч\nШш\nЩщ\nЪъ\nЫы\nЬь\nЭэ\nЮю\nЯя\nѠѡ\nѢѣ\nѤѥ\nѦѧ\nѨѩ\nѪѫ\nѬѭ\nѮѯ\nѰѱ\nѲѳ\nѴѵ\nѶѷ\nѸѹ\nѺѻ\n" +
  "Ѽѽ\nѾѿ\nҀҁ\nҊҋ\nҌҍ\nҎҏ\nҐґ\nҒғ\nҔҕ\nҖҗ\nҘҙ\nҚқ\nҜҝ\nҞҟ\nҠҡ\nҢң\nҤҥ\nҦҧ\nҨҩ\nҪҫ\nҬҭ\nҮү\nҰұ\nҲҳ\nҴҵ\nҶҷ\nҸҹ\nҺһ\nҼҽ\nҾҿ\nӀӏ\nӁӂ\nӃӄ\nӅӆ\nӇӈ\nӉӊ\n" +
  "Ӌӌ\nӍӎ\nӐӑ\nӒӓ\nӔӕ\nӖӗ\nӘә\nӚӛ\nӜӝ\nӞӟ\nӠӡ\nӢӣ\nӤӥ\nӦӧ\nӨө\nӪӫ\nӬӭ\nӮӯ\nӰӱ\nӲӳ\nӴӵ\nӶӷ\nӸӹ\nӺӻ\nӼӽ\nӾӿ\nԀԁ\nԂԃ\nԄԅ\nԆԇ\nԈԉ\nԊԋ\nԌԍ\nԎԏ\nԐԑ\nԒԓ\n" +
  "Ԕԕ\nԖԗ\nԘԙ\nԚԛ\nԜԝ\nԞԟ\nԠԡ\nԢԣ\nԤԥ\nԦԧ\nԨԩ\nԪԫ\nԬԭ\nԮԯ\nԱա\nԲբ\nԳգ\nԴդ\nԵե\nԶզ\nԷէ\nԸը\nԹթ\nԺժ\nԻի\nԼլ\nԽխ\nԾծ\nԿկ\nՀհ\nՁձ\nՂղ\nՃճ\nՄմ\nՅյ\nՆն\n" +
  "Շշ\nՈո\nՉչ\nՊպ\nՋջ\nՌռ\nՍս\nՎվ\nՏտ\nՐր\nՑց\nՒւ\nՓփ\nՔք\nՕօ\nՖֆ\nևեւ\nႠⴀ\nႡⴁ\nႢⴂ\nႣⴃ\nႤⴄ\nႥⴅ\nႦⴆ\nႧⴇ\nႨⴈ\nႩⴉ\nႪⴊ\nႫⴋ\nႬⴌ\nႭⴍ\nႮⴎ\nႯⴏ\nႰⴐ\nႱⴑ\nႲⴒ\n" +
  "Ⴓⴓ\nႴⴔ\nႵⴕ\nႶⴖ\nႷⴗ\nႸⴘ\nႹⴙ\nႺⴚ\nႻⴛ\nႼⴜ\nႽⴝ\nႾⴞ\nႿⴟ\nჀⴠ\nჁⴡ\nჂⴢ\nჃⴣ\nჄⴤ\nჅⴥ\nჇⴧ\nჍⴭ\nᏸᏰ\nᏹᏱ\nᏺᏲ\nᏻᏳ\nᏼᏴ\nᏽᏵ\nᲀв\nᲁд\nᲂо\nᲃс\nᲄт\nᲅт\nᲆъ\nᲇѣ\nᲈꙋ\n" +
  "Ᲊᲊ\nᲐა\nᲑბ\nᲒგ\nᲓდ\nᲔე\nᲕვ\nᲖზ\nᲗთ\nᲘი\nᲙკ\nᲚლ\nᲛმ\nᲜნ\nᲝო\nᲞპ\nᲟჟ\nᲠრ\nᲡს\nᲢტ\nᲣუ\nᲤფ\nᲥქ\nᲦღ\nᲧყ\nᲨშ\nᲩჩ\nᲪც\nᲫძ\nᲬწ\nᲭჭ\nᲮხ\nᲯჯ\nᲰჰ\nᲱჱ\nᲲჲ\n" +
  "Ჳჳ\nᲴჴ\nᲵჵ\nᲶჶ\nᲷჷ\nᲸჸ\nᲹჹ\nᲺჺ\nᲽჽ\nᲾჾ\nᲿჿ\nḀḁ\nḂḃ\nḄḅ\nḆḇ\nḈḉ\nḊḋ\nḌḍ\nḎḏ\nḐḑ\nḒḓ\nḔḕ\nḖḗ\nḘḙ\nḚḛ\nḜḝ\nḞḟ\nḠḡ\nḢḣ\nḤḥ\nḦḧ\nḨḩ\nḪḫ\nḬḭ\nḮḯ\nḰḱ\n" +
  "Ḳḳ\nḴḵ\nḶḷ\nḸḹ\nḺḻ\nḼḽ\nḾḿ\nṀṁ\nṂṃ\nṄṅ\nṆṇ\nṈṉ\nṊṋ\nṌṍ\nṎṏ\nṐṑ\nṒṓ\nṔṕ\nṖṗ\nṘṙ\nṚṛ\nṜṝ\nṞṟ\nṠṡ\nṢṣ\nṤṥ\nṦṧ\nṨṩ\nṪṫ\nṬṭ\nṮṯ\nṰṱ\nṲṳ\nṴṵ\nṶṷ\nṸṹ\n" +
  "Ṻṻ\nṼṽ\nṾṿ\nẀẁ\nẂẃ\nẄẅ\nẆẇ\nẈẉ\nẊẋ\nẌẍ\nẎẏ\nẐẑ\nẒẓ\nẔẕ\nẖẖ\nẗẗ\nẘẘ\nẙẙ\nẚaʾ\nẛṡ\nẞss\nẠạ\nẢả\nẤấ\nẦầ\nẨẩ\nẪẫ\nẬậ\nẮắ\nẰằ\nẲẳ\nẴẵ\nẶặ\nẸẹ\n" +
  "Ẻẻ\nẼẽ\nẾế\nỀề\nỂể\nỄễ\nỆệ\nỈỉ\nỊị\nỌọ\nỎỏ\nỐố\nỒồ\nỔổ\nỖỗ\nỘộ\nỚớ\nỜờ\nỞở\nỠỡ\nỢợ\nỤụ\nỦủ\nỨứ\nỪừ\nỬử\nỮữ\nỰự\nỲỳ\nỴỵ\nỶỷ\nỸỹ\nỺỻ\nỼỽ\nỾỿ\nἈἀ\n" +
  "Ἁἁ\nἊἂ\nἋἃ\nἌἄ\nἍἅ\nἎἆ\nἏἇ\nἘἐ\nἙἑ\nἚἒ\nἛἓ\nἜἔ\nἝἕ\nἨἠ\nἩἡ\nἪἢ\nἫἣ\nἬἤ\nἭἥ\nἮἦ\nἯἧ\nἸἰ\nἹἱ\nἺἲ\nἻἳ\nἼἴ\nἽἵ\nἾἶ\nἿἷ\nὈὀ\nὉὁ\nὊὂ\nὋὃ\nὌὄ\nὍὅ\nὐὐ\n" +
  "ὒὒ\nὔὔ\nὖὖ\nὙὑ\nὛὓ\nὝὕ\nὟὗ\nὨὠ\nὩὡ\nὪὢ\nὫὣ\nὬὤ\nὭὥ\nὮὦ\nὯὧ\nᾀἀι\nᾁἁι\nᾂἂι\nᾃἃι\nᾄἄι\nᾅἅι\nᾆἆι\nᾇἇι\nᾈἀι\nᾉἁι\nᾊἂι\nᾋἃι\nᾌἄι\nᾍἅι\n" +
  "ᾎἆι\nᾏἇι\nᾐἠι\nᾑἡι\nᾒἢι\nᾓἣι\nᾔἤι\nᾕἥι\nᾖἦι\nᾗἧι\nᾘἠι\nᾙἡι\nᾚἢι\nᾛἣι\nᾜἤι\nᾝἥι\nᾞἦι\nᾟἧι\nᾠὠι\nᾡὡι\nᾢὢι\nᾣὣι\nᾤὤι\nᾥὥι\nᾦὦι\nᾧὧι\nᾨὠι\n" +
  "ᾩὡι\nᾪὢι\nᾫὣι\nᾬὤι\nᾭὥι\nᾮὦι\nᾯὧι\nᾲὰι\nᾳαι\nᾴάι\nᾶᾶ\nᾷᾶι\nᾸᾰ\nᾹᾱ\nᾺὰ\nΆά\nᾼαι\nιι\nῂὴι\nῃηι\nῄήι\nῆῆ\nῇῆι\nῈὲ\nΈέ\nῊὴ\nΉή\nῌηι\nῒῒ\n" +
  "ΐΐ\nῖῖ\nῗῗ\nῘῐ\nῙῑ\nῚὶ\nΊί\nῢῢ\nΰΰ\nῤῤ\nῦῦ\nῧῧ\nῨῠ\nῩῡ\nῪὺ\nΎύ\nῬῥ\nῲὼι\nῳωι\nῴώι\nῶῶ\nῷῶι\nῸὸ\nΌό\nῺὼ\nΏώ\nῼωι\nΩω\nKk\nÅå\n" +
  "Ⅎⅎ\nⅠⅰ\nⅡⅱ\nⅢⅲ\nⅣⅳ\nⅤⅴ\nⅥⅵ\nⅦⅶ\nⅧⅷ\nⅨⅸ\nⅩⅹ\nⅪⅺ\nⅫⅻ\nⅬⅼ\nⅭⅽ\nⅮⅾ\nⅯⅿ\nↃↄ\nⒶⓐ\nⒷⓑ\nⒸⓒ\nⒹⓓ\nⒺⓔ\nⒻⓕ\nⒼⓖ\nⒽⓗ\nⒾⓘ\nⒿⓙ\nⓀⓚ\nⓁⓛ\nⓂⓜ\nⓃⓝ\nⓄⓞ\nⓅⓟ\nⓆⓠ\nⓇⓡ\n" +
  "Ⓢⓢ\nⓉⓣ\nⓊⓤ\nⓋⓥ\nⓌⓦ\nⓍⓧ\nⓎⓨ\nⓏⓩ\nⰀⰰ\nⰁⰱ\nⰂⰲ\nⰃⰳ\nⰄⰴ\nⰅⰵ\nⰆⰶ\nⰇⰷ\nⰈⰸ\nⰉⰹ\nⰊⰺ\nⰋⰻ\nⰌⰼ\nⰍⰽ\nⰎⰾ\nⰏⰿ\nⰐⱀ\nⰑⱁ\nⰒⱂ\nⰓⱃ\nⰔⱄ\nⰕⱅ\nⰖⱆ\nⰗⱇ\nⰘⱈ\nⰙⱉ\nⰚⱊ\nⰛⱋ\n" +
  "Ⱌⱌ\nⰝⱍ\nⰞⱎ\nⰟⱏ\nⰠⱐ\nⰡⱑ\nⰢⱒ\nⰣⱓ\nⰤⱔ\nⰥⱕ\nⰦⱖ\nⰧⱗ\nⰨⱘ\nⰩⱙ\nⰪⱚ\nⰫⱛ\nⰬⱜ\nⰭⱝ\nⰮⱞ\nⰯⱟ\nⱠⱡ\nⱢɫ\nⱣᵽ\nⱤɽ\nⱧⱨ\nⱩⱪ\nⱫⱬ\nⱭɑ\nⱮɱ\nⱯɐ\nⱰɒ\nⱲⱳ\nⱵⱶ\nⱾȿ\nⱿɀ\nⲀⲁ\n" +
  "Ⲃⲃ\nⲄⲅ\nⲆⲇ\nⲈⲉ\nⲊⲋ\nⲌⲍ\nⲎⲏ\nⲐⲑ\nⲒⲓ\nⲔⲕ\nⲖⲗ\nⲘⲙ\nⲚⲛ\nⲜⲝ\nⲞⲟ\nⲠⲡ\nⲢⲣ\nⲤⲥ\nⲦⲧ\nⲨⲩ\nⲪⲫ\nⲬⲭ\nⲮⲯ\nⲰⲱ\nⲲⲳ\nⲴⲵ\nⲶⲷ\nⲸⲹ\nⲺⲻ\nⲼⲽ\nⲾⲿ\nⳀⳁ\nⳂⳃ\nⳄⳅ\nⳆⳇ\nⳈⳉ\n" +
  "Ⳋⳋ\nⳌⳍ\nⳎⳏ\nⳐⳑ\nⳒⳓ\nⳔⳕ\nⳖⳗ\nⳘⳙ\nⳚⳛ\nⳜⳝ\nⳞⳟ\nⳠⳡ\nⳢⳣ\nⳫⳬ\nⳭⳮ\nⳲⳳ\nꙀꙁ\nꙂꙃ\nꙄꙅ\nꙆꙇ\nꙈꙉ\nꙊꙋ\nꙌꙍ\nꙎꙏ\nꙐꙑ\nꙒꙓ\nꙔꙕ\nꙖꙗ\nꙘꙙ\nꙚꙛ\nꙜꙝ\nꙞꙟ\nꙠꙡ\nꙢꙣ\nꙤꙥ\nꙦꙧ\n" +
  "Ꙩꙩ\nꙪꙫ\nꙬꙭ\nꚀꚁ\nꚂꚃ\nꚄꚅ\nꚆꚇ\nꚈꚉ\nꚊꚋ\nꚌꚍ\nꚎꚏ\nꚐꚑ\nꚒꚓ\nꚔꚕ\nꚖꚗ\nꚘꚙ\nꚚꚛ\nꜢꜣ\nꜤꜥ\nꜦꜧ\nꜨꜩ\nꜪꜫ\nꜬꜭ\nꜮꜯ\nꜲꜳ\nꜴꜵ\nꜶꜷ\nꜸꜹ\nꜺꜻ\nꜼꜽ\nꜾꜿ\nꝀꝁ\nꝂꝃ\nꝄꝅ\nꝆꝇ\nꝈꝉ\n" +
  "Ꝋꝋ\nꝌꝍ\nꝎꝏ\nꝐꝑ\nꝒꝓ\nꝔꝕ\nꝖꝗ\nꝘꝙ\nꝚꝛ\nꝜꝝ\nꝞꝟ\nꝠꝡ\nꝢꝣ\nꝤꝥ\nꝦꝧ\nꝨꝩ\nꝪꝫ\nꝬꝭ\nꝮꝯ\nꝹꝺ\nꝻꝼ\nꝽᵹ\nꝾꝿ\nꞀꞁ\nꞂꞃ\nꞄꞅ\nꞆꞇ\nꞋꞌ\nꞍɥ\nꞐꞑ\nꞒꞓ\nꞖꞗ\nꞘꞙ\nꞚꞛ\nꞜꞝ\nꞞꞟ\n" +
  "Ꞡꞡ\nꞢꞣ\nꞤꞥ\nꞦꞧ\nꞨꞩ\nꞪɦ\nꞫɜ\nꞬɡ\nꞭɬ\nꞮɪ\nꞰʞ\nꞱʇ\nꞲʝ\nꞳꭓ\nꞴꞵ\nꞶꞷ\nꞸꞹ\nꞺꞻ\nꞼꞽ\nꞾꞿ\nꟀꟁ\nꟂꟃ\nꟄꞔ\nꟅʂ\nꟆᶎ\nꟇꟈ\nꟉꟊ\nꟋɤ\nꟌꟍ\n꟎꟏\nꟐꟑ\n꟒ꟓ\n꟔ꟕ\nꟖꟗ\nꟘꟙ\nꟚꟛ\n" +
  "Ƛƛ\nꟵꟶ\nꭰᎠ\nꭱᎡ\nꭲᎢ\nꭳᎣ\nꭴᎤ\nꭵᎥ\nꭶᎦ\nꭷᎧ\nꭸᎨ\nꭹᎩ\nꭺᎪ\nꭻᎫ\nꭼᎬ\nꭽᎭ\nꭾᎮ\nꭿᎯ\nꮀᎰ\nꮁᎱ\nꮂᎲ\nꮃᎳ\nꮄᎴ\nꮅᎵ\nꮆᎶ\nꮇᎷ\nꮈᎸ\nꮉᎹ\nꮊᎺ\nꮋᎻ\nꮌᎼ\nꮍᎽ\nꮎᎾ\nꮏᎿ\nꮐᏀ\nꮑᏁ\n" +
  "ꮒᏂ\nꮓᏃ\nꮔᏄ\nꮕᏅ\nꮖᏆ\nꮗᏇ\nꮘᏈ\nꮙᏉ\nꮚᏊ\nꮛᏋ\nꮜᏌ\nꮝᏍ\nꮞᏎ\nꮟᏏ\nꮠᏐ\nꮡᏑ\nꮢᏒ\nꮣᏓ\nꮤᏔ\nꮥᏕ\nꮦᏖ\nꮧᏗ\nꮨᏘ\nꮩᏙ\nꮪᏚ\nꮫᏛ\nꮬᏜ\nꮭᏝ\nꮮᏞ\nꮯᏟ\nꮰᏠ\nꮱᏡ\nꮲᏢ\nꮳᏣ\nꮴᏤ\nꮵᏥ\n" +
  "ꮶᏦ\nꮷᏧ\nꮸᏨ\nꮹᏩ\nꮺᏪ\nꮻᏫ\nꮼᏬ\nꮽᏭ\nꮾᏮ\nꮿᏯ\nﬀff\nﬁfi\nﬂfl\nﬃffi\nﬄffl\nﬅst\nﬆst\nﬓմն\nﬔմե\nﬕմի\nﬖվն\nﬗմխ\nＡａ\nＢｂ\nＣｃ\nＤｄ\nＥｅ\nＦｆ\nＧｇ\nＨｈ\nＩｉ\nＪｊ\n" +
  "Ｋｋ\nＬｌ\nＭｍ\nＮｎ\nＯｏ\nＰｐ\nＱｑ\nＲｒ\nＳｓ\nＴｔ\nＵｕ\nＶｖ\nＷｗ\nＸｘ\nＹｙ\nＺｚ\n𐐀𐐨\n𐐁𐐩\n𐐂𐐪\n𐐃𐐫\n𐐄𐐬\n𐐅𐐭\n𐐆𐐮\n𐐇𐐯\n𐐈𐐰\n𐐉𐐱\n𐐊𐐲\n𐐋𐐳\n" +
  "𐐌𐐴\n𐐍𐐵\n𐐎𐐶\n𐐏𐐷\n𐐐𐐸\n𐐑𐐹\n𐐒𐐺\n𐐓𐐻\n𐐔𐐼\n𐐕𐐽\n𐐖𐐾\n𐐗𐐿\n𐐘𐑀\n𐐙𐑁\n𐐚𐑂\n𐐛𐑃\n𐐜𐑄\n𐐝𐑅\n𐐞𐑆\n𐐟𐑇\n𐐠𐑈\n𐐡𐑉\n" +
  "𐐢𐑊\n𐐣𐑋\n𐐤𐑌\n𐐥𐑍\n𐐦𐑎\n𐐧𐑏\n𐒰𐓘\n𐒱𐓙\n𐒲𐓚\n𐒳𐓛\n𐒴𐓜\n𐒵𐓝\n𐒶𐓞\n𐒷𐓟\n𐒸𐓠\n𐒹𐓡\n𐒺𐓢\n𐒻𐓣\n𐒼𐓤\n𐒽𐓥\n𐒾𐓦\n𐒿𐓧\n" +
  "𐓀𐓨\n𐓁𐓩\n𐓂𐓪\n𐓃𐓫\n𐓄𐓬\n𐓅𐓭\n𐓆𐓮\n𐓇𐓯\n𐓈𐓰\n𐓉𐓱\n𐓊𐓲\n𐓋𐓳\n𐓌𐓴\n𐓍𐓵\n𐓎𐓶\n𐓏𐓷\n𐓐𐓸\n𐓑𐓹\n𐓒𐓺\n𐓓𐓻\n𐕰𐖗\n𐕱𐖘\n" +
  "𐕲𐖙\n𐕳𐖚\n𐕴𐖛\n𐕵𐖜\n𐕶𐖝\n𐕷𐖞\n𐕸𐖟\n𐕹𐖠\n𐕺𐖡\n𐕼𐖣\n𐕽𐖤\n𐕾𐖥\n𐕿𐖦\n𐖀𐖧\n𐖁𐖨\n𐖂𐖩\n𐖃𐖪\n𐖄𐖫\n𐖅𐖬\n𐖆𐖭\n𐖇𐖮\n𐖈𐖯\n" +
  "𐖉𐖰\n𐖊𐖱\n𐖌𐖳\n𐖍𐖴\n𐖎𐖵\n𐖏𐖶\n𐖐𐖷\n𐖑𐖸\n𐖒𐖹\n𐖔𐖻\n𐖕𐖼\n𐲀𐳀\n𐲁𐳁\n𐲂𐳂\n𐲃𐳃\n𐲄𐳄\n𐲅𐳅\n𐲆𐳆\n𐲇𐳇\n𐲈𐳈\n𐲉𐳉\n𐲊𐳊\n" +
  "𐲋𐳋\n𐲌𐳌\n𐲍𐳍\n𐲎𐳎\n𐲏𐳏\n𐲐𐳐\n𐲑𐳑\n𐲒𐳒\n𐲓𐳓\n𐲔𐳔\n𐲕𐳕\n𐲖𐳖\n𐲗𐳗\n𐲘𐳘\n𐲙𐳙\n𐲚𐳚\n𐲛𐳛\n𐲜𐳜\n𐲝𐳝\n𐲞𐳞\n𐲟𐳟\n𐲠𐳠\n" +
  "𐲡𐳡\n𐲢𐳢\n𐲣𐳣\n𐲤𐳤\n𐲥𐳥\n𐲦𐳦\n𐲧𐳧\n𐲨𐳨\n𐲩𐳩\n𐲪𐳪\n𐲫𐳫\n𐲬𐳬\n𐲭𐳭\n𐲮𐳮\n𐲯𐳯\n𐲰𐳰\n𐲱𐳱\n𐲲𐳲\n𐵐𐵰\n𐵑𐵱\n𐵒𐵲\n𐵓𐵳\n" +
  "𐵔𐵴\n𐵕𐵵\n𐵖𐵶\n𐵗𐵷\n𐵘𐵸\n𐵙𐵹\n𐵚𐵺\n𐵛𐵻\n𐵜𐵼\n𐵝𐵽\n𐵞𐵾\n𐵟𐵿\n𐵠𐶀\n𐵡𐶁\n𐵢𐶂\n𐵣𐶃\n𐵤𐶄\n𐵥𐶅\n𑢠𑣀\n𑢡𑣁\n𑢢𑣂\n𑢣𑣃\n" +
  "𑢤𑣄\n𑢥𑣅\n𑢦𑣆\n𑢧𑣇\n𑢨𑣈\n𑢩𑣉\n𑢪𑣊\n𑢫𑣋\n𑢬𑣌\n𑢭𑣍\n𑢮𑣎\n𑢯𑣏\n𑢰𑣐\n𑢱𑣑\n𑢲𑣒\n𑢳𑣓\n𑢴𑣔\n𑢵𑣕\n𑢶𑣖\n𑢷𑣗\n𑢸𑣘\n𑢹𑣙\n" +
  "𑢺𑣚\n𑢻𑣛\n𑢼𑣜\n𑢽𑣝\n𑢾𑣞\n𑢿𑣟\n𖹀𖹠\n𖹁𖹡\n𖹂𖹢\n𖹃𖹣\n𖹄𖹤\n𖹅𖹥\n𖹆𖹦\n𖹇𖹧\n𖹈𖹨\n𖹉𖹩\n𖹊𖹪\n𖹋𖹫\n𖹌𖹬\n𖹍𖹭\n𖹎𖹮\n𖹏𖹯\n" +
  "𖹐𖹰\n𖹑𖹱\n𖹒𖹲\n𖹓𖹳\n𖹔𖹴\n𖹕𖹵\n𖹖𖹶\n𖹗𖹷\n𖹘𖹸\n𖹙𖹹\n𖹚𖹺\n𖹛𖹻\n𖹜𖹼\n𖹝𖹽\n𖹞𖹾\n𖹟𖹿\n𖺠𖺻\n𖺡𖺼\n𖺢𖺽\n𖺣𖺾\n𖺤𖺿\n𖺥𖻀\n" +
  "𖺦𖻁\n𖺧𖻂\n𖺨𖻃\n𖺩𖻄\n𖺪𖻅\n𖺫𖻆\n𖺬𖻇\n𖺭𖻈\n𖺮𖻉\n𖺯𖻊\n𖺰𖻋\n𖺱𖻌\n𖺲𖻍\n𖺳𖻎\n𖺴𖻏\n𖺵𖻐\n𖺶𖻑\n𖺷𖻒\n𖺸𖻓\n𞤀𞤢\n𞤁𞤣\n𞤂𞤤\n" +
  "𞤃𞤥\n𞤄𞤦\n𞤅𞤧\n𞤆𞤨\n𞤇𞤩\n𞤈𞤪\n𞤉𞤫\n𞤊𞤬\n𞤋𞤭\n𞤌𞤮\n𞤍𞤯\n𞤎𞤰\n𞤏𞤱\n𞤐𞤲\n𞤑𞤳\n𞤒𞤴\n𞤓𞤵\n𞤔𞤶\n𞤕𞤷\n𞤖𞤸\n𞤗𞤹\n𞤘𞤺\n" +
  "𞤙𞤻\n𞤚𞤼\n𞤛𞤽\n𞤜𞤾\n𞤝𞤿\n𞤞𞥀\n𞤟𞥁\n𞤠𞥂\n𞤡𞥃";

/** One entry per line in {@link CASE_FOLD_TABLE_DATA}; pinned by the digest test. */
export const CASE_FOLD_TABLE_ENTRY_COUNT = 1585;

/**
 * The table parsed: the first code point of each line is the key, the remainder its replacement
 * (one or more code points). A code point the map does not hold folds to itself.
 */
export const CASE_FOLD_MAP: ReadonlyMap<string, string> = new Map(
  CASE_FOLD_TABLE_DATA.split("\n").map((line) => {
    const key = String.fromCodePoint(line.codePointAt(0) as number);
    return [key, line.slice(key.length)] as const;
  }),
);
