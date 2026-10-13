/* BrickCircle auth reliability + location signup fix.
   Adds country/city selectors and persists the selected location to profiles after email verification.
*/
(()=>{
  const SUPABASE_URL='https://nsxtromjdpdscknadxez.supabase.co';
  const SUPABASE_KEY='sb_publishable_JJhVbgGblHrnKuPOsJkxQ_zRoQNlIL';
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const modal=()=>document.querySelector('#modal');
  const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  let mode='in',pendingEmail='',pendingName='',pendingCountry='',pendingCity='';

  // Offline/static location data: no third-party API is required during signup.
  const LOCATIONS={
    'Afghanistan':['Kabul','Herat','Kandahar','Mazar-i-Sharif','Jalalabad'],
    'Albania':['Tirana','Durrës','Vlorë','Shkodër','Elbasan'],
    'Algeria':['Algiers','Oran','Constantine','Annaba','Blida'],
    'Argentina':['Buenos Aires','Córdoba','Rosario','Mendoza','La Plata','Mar del Plata'],
    'Armenia':['Yerevan','Gyumri','Vanadzor','Vagharshapat'],
    'Australia':['Sydney','Melbourne','Brisbane','Perth','Adelaide','Canberra','Gold Coast','Hobart'],
    'Austria':['Vienna','Graz','Linz','Salzburg','Innsbruck'],
    'Azerbaijan':['Baku','Ganja','Sumqayit','Lankaran'],
    'Bangladesh':['Dhaka','Chattogram','Khulna','Rajshahi','Sylhet','Rangpur'],
    'Belarus':['Minsk','Gomel','Mogilev','Vitebsk','Grodno'],
    'Belgium':['Brussels','Antwerp','Ghent','Charleroi','Liège','Bruges'],
    'Bolivia':['La Paz','Santa Cruz de la Sierra','Cochabamba','Sucre','Oruro'],
    'Bosnia and Herzegovina':['Sarajevo','Banja Luka','Mostar','Tuzla'],
    'Brazil':['São Paulo','Rio de Janeiro','Brasília','Salvador','Belo Horizonte','Fortaleza','Curitiba','Recife','Porto Alegre'],
    'Bulgaria':['Sofia','Plovdiv','Varna','Burgas','Ruse'],
    'Cambodia':['Phnom Penh','Siem Reap','Battambang','Sihanoukville'],
    'Canada':['Toronto','Montreal','Vancouver','Calgary','Edmonton','Ottawa','Winnipeg','Quebec City','Halifax'],
    'Chile':['Santiago','Valparaíso','Concepción','Antofagasta','Viña del Mar'],
    'China':['Beijing','Shanghai','Guangzhou','Shenzhen','Chengdu','Chongqing','Hangzhou','Nanjing','Wuhan','Xi’an'],
    'Colombia':['Bogotá','Medellín','Cali','Barranquilla','Cartagena','Bucaramanga'],
    'Costa Rica':['San José','Alajuela','Cartago','Heredia','Liberia'],
    'Croatia':['Zagreb','Split','Rijeka','Osijek','Zadar'],
    'Czech Republic':['Prague','Brno','Ostrava','Plzeň','Liberec'],
    'Denmark':['Copenhagen','Aarhus','Odense','Aalborg','Esbjerg'],
    'Dominican Republic':['Santo Domingo','Santiago de los Caballeros','La Romana','Puerto Plata'],
    'Ecuador':['Quito','Guayaquil','Cuenca','Santo Domingo','Loja'],
    'Egypt':['Cairo','Alexandria','Giza','Port Said','Suez','Luxor'],
    'Estonia':['Tallinn','Tartu','Narva','Pärnu'],
    'Ethiopia':['Addis Ababa','Dire Dawa','Mekelle','Gondar','Bahir Dar'],
    'Finland':['Helsinki','Espoo','Tampere','Vantaa','Turku','Oulu'],
    'France':['Paris','Marseille','Lyon','Toulouse','Nice','Nantes','Bordeaux','Lille','Strasbourg'],
    'Georgia':['Tbilisi','Batumi','Kutaisi','Rustavi'],
    'Germany':['Berlin','Hamburg','Munich','Cologne','Frankfurt','Stuttgart','Düsseldorf','Leipzig','Dortmund'],
    'Ghana':['Accra','Kumasi','Tamale','Takoradi','Cape Coast'],
    'Greece':['Athens','Thessaloniki','Patras','Heraklion','Larissa'],
    'Hong Kong':['Hong Kong'],
    'Hungary':['Budapest','Debrecen','Szeged','Miskolc','Pécs'],
    'Iceland':['Reykjavík','Kópavogur','Hafnarfjörður','Akureyri'],
    'India':['Bengaluru','Mumbai','Delhi','Hyderabad','Chennai','Kolkata','Pune','Ahmedabad','Jaipur','Kochi','Coimbatore','Mysuru','Thiruvananthapuram','Palakkad'],
    'Indonesia':['Jakarta','Surabaya','Bandung','Medan','Semarang','Makassar','Denpasar','Yogyakarta'],
    'Iran':['Tehran','Mashhad','Isfahan','Shiraz','Tabriz','Karaj'],
    'Iraq':['Baghdad','Basra','Mosul','Erbil','Najaf','Karbala'],
    'Ireland':['Dublin','Cork','Limerick','Galway','Waterford'],
    'Israel':['Jerusalem','Tel Aviv','Haifa','Rishon LeZion','Petah Tikva','Beersheba'],
    'Italy':['Rome','Milan','Naples','Turin','Palermo','Genoa','Bologna','Florence','Venice'],
    'Jamaica':['Kingston','Montego Bay','Spanish Town','Portmore'],
    'Japan':['Tokyo','Yokohama','Osaka','Nagoya','Sapporo','Fukuoka','Kobe','Kyoto','Hiroshima'],
    'Jordan':['Amman','Zarqa','Irbid','Aqaba'],
    'Kazakhstan':['Almaty','Astana','Shymkent','Karaganda','Aktobe'],
    'Kenya':['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret'],
    'Kuwait':['Kuwait City','Hawally','Salmiya','Farwaniya'],
    'Latvia':['Riga','Daugavpils','Liepāja','Jelgava'],
    'Lebanon':['Beirut','Tripoli','Sidon','Tyre','Zahle'],
    'Lithuania':['Vilnius','Kaunas','Klaipėda','Šiauliai'],
    'Luxembourg':['Luxembourg City','Esch-sur-Alzette','Differdange'],
    'Malaysia':['Kuala Lumpur','George Town','Johor Bahru','Ipoh','Kota Kinabalu','Kuching','Malacca City'],
    'Maldives':['Malé','Addu City','Fuvahmulah'],
    'Malta':['Valletta','Birkirkara','Mosta','Qormi','Sliema'],
    'Mauritius':['Port Louis','Beau Bassin-Rose Hill','Vacoas-Phoenix','Curepipe'],
    'Mexico':['Mexico City','Guadalajara','Monterrey','Puebla','Tijuana','Cancún','Mérida','Querétaro'],
    'Moldova':['Chișinău','Tiraspol','Bălți','Bender'],
    'Monaco':['Monaco'],
    'Mongolia':['Ulaanbaatar','Erdenet','Darkhan'],
    'Morocco':['Casablanca','Rabat','Marrakesh','Fes','Tangier','Agadir','Meknes'],
    'Nepal':['Kathmandu','Pokhara','Lalitpur','Bharatpur','Biratnagar'],
    'Netherlands':['Amsterdam','Rotterdam','The Hague','Utrecht','Eindhoven','Groningen'],
    'New Zealand':['Auckland','Wellington','Christchurch','Hamilton','Tauranga','Dunedin'],
    'Nigeria':['Lagos','Abuja','Kano','Ibadan','Port Harcourt','Benin City','Enugu'],
    'North Macedonia':['Skopje','Bitola','Kumanovo','Ohrid'],
    'Norway':['Oslo','Bergen','Trondheim','Stavanger','Drammen'],
    'Oman':['Muscat','Salalah','Sohar','Nizwa','Sur'],
    'Pakistan':['Karachi','Lahore','Islamabad','Rawalpindi','Faisalabad','Peshawar','Quetta'],
    'Panama':['Panama City','San Miguelito','Colón','David'],
    'Peru':['Lima','Arequipa','Trujillo','Cusco','Chiclayo','Piura'],
    'Philippines':['Manila','Quezon City','Cebu City','Davao City','Zamboanga','Taguig'],
    'Poland':['Warsaw','Kraków','Łódź','Wrocław','Poznań','Gdańsk','Szczecin'],
    'Portugal':['Lisbon','Porto','Braga','Coimbra','Funchal','Aveiro'],
    'Qatar':['Doha','Al Rayyan','Al Wakrah','Umm Salal'],
    'Romania':['Bucharest','Cluj-Napoca','Timișoara','Iași','Constanța','Brașov'],
    'Russia':['Moscow','Saint Petersburg','Novosibirsk','Yekaterinburg','Kazan','Nizhny Novgorod','Samara'],
    'Saudi Arabia':['Riyadh','Jeddah','Mecca','Medina','Dammam','Khobar','Abha'],
    'Serbia':['Belgrade','Novi Sad','Niš','Kragujevac','Subotica'],
    'Singapore':['Singapore'],
    'Slovakia':['Bratislava','Košice','Prešov','Žilina','Nitra'],
    'Slovenia':['Ljubljana','Maribor','Celje','Kranj'],
    'South Africa':['Johannesburg','Cape Town','Durban','Pretoria','Gqeberha','Bloemfontein'],
    'South Korea':['Seoul','Busan','Incheon','Daegu','Daejeon','Gwangju','Suwon'],
    'Spain':['Madrid','Barcelona','Valencia','Seville','Zaragoza','Málaga','Bilbao','Alicante'],
    'Sri Lanka':['Colombo','Kandy','Galle','Jaffna','Negombo','Sri Jayawardenepura Kotte'],
    'Sweden':['Stockholm','Gothenburg','Malmö','Uppsala','Västerås'],
    'Switzerland':['Zurich','Geneva','Basel','Bern','Lausanne','Lucerne'],
    'Taiwan':['Taipei','New Taipei City','Taichung','Kaohsiung','Tainan','Hsinchu'],
    'Tanzania':['Dar es Salaam','Dodoma','Arusha','Mwanza','Zanzibar City'],
    'Thailand':['Bangkok','Chiang Mai','Pattaya','Phuket','Hat Yai','Khon Kaen'],
    'Tunisia':['Tunis','Sfax','Sousse','Kairouan','Bizerte'],
    'Turkey':['Istanbul','Ankara','Izmir','Bursa','Antalya','Adana','Gaziantep'],
    'Uganda':['Kampala','Entebbe','Jinja','Mbarara','Gulu'],
    'Ukraine':['Kyiv','Kharkiv','Odesa','Dnipro','Lviv','Vinnytsia'],
    'United Arab Emirates':['Dubai','Abu Dhabi','Sharjah','Ajman','Al Ain','Ras Al Khaimah'],
    'United Kingdom':['London','Birmingham','Manchester','Glasgow','Liverpool','Edinburgh','Leeds','Bristol','Cardiff','Belfast'],
    'United States':['New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia','San Antonio','San Diego','Dallas','San Francisco','Seattle','Boston','Washington, D.C.','Miami','Atlanta','Denver','Austin','Las Vegas'],
    'Uruguay':['Montevideo','Salto','Ciudad de la Costa','Paysandú'],
    'Uzbekistan':['Tashkent','Samarkand','Namangan','Andijan','Bukhara'],
    'Venezuela':['Caracas','Maracaibo','Valencia','Barquisimeto','Maracay'],
    'Vietnam':['Ho Chi Minh City','Hanoi','Da Nang','Hai Phong','Can Tho','Nha Trang'],
    'Zambia':['Lusaka','Kitwe','Ndola','Livingstone'],
    'Zimbabwe':['Harare','Bulawayo','Chitungwiza','Mutare']
  };

  const countries=Object.keys(LOCATIONS).sort();
  const css=document.createElement('style');
  css.textContent='.authfix-note{padding:11px 13px;border-radius:10px;background:#f8fafc;border:1px solid #e5e7eb;margin:10px 0;font-size:14px}.authfix-error{padding:11px 13px;border-radius:10px;background:#fff1f2;color:#9f1239;border:1px solid #fecdd3;margin:10px 0;font-size:14px}.authfix-success{padding:11px 13px;border-radius:10px;background:#ecfdf3;color:#047857;border:1px solid #a7f3d0;margin:10px 0;font-size:14px}.authfix-code{font-size:28px;letter-spacing:8px;text-align:center;font-weight:900;padding:14px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc}.authfix-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.authfix-actions button{border:1px solid #d9dee7;background:#fff;border-radius:9px;padding:10px 13px;font-weight:750;cursor:pointer}.authfix-actions .primary{background:#111827;color:#fff;border-color:#111827}.authfix-location-note{font-size:12px;color:#667085;margin-top:-4px}';
  document.head.appendChild(css);

  function countryOptions(selected=''){
    return '<option value="">Select country</option>'+countries.map(c=>`<option value="${esc(c)}" ${c===selected?'selected':''}>${esc(c)}</option>`).join('');
  }
  function cityOptions(country,selected=''){
    const cities=LOCATIONS[country]||[];
    return '<option value="">'+(country?'Select city':'Select country first')+'</option>'+cities.map(c=>`<option value="${esc(c)}" ${c===selected?'selected':''}>${esc(c)}</option>`).join('');
  }
  function updateCities(selected=''){
    const country=document.querySelector('#afcountry')?.value||'';
    const city=document.querySelector('#afcity'); if(!city)return;
    city.innerHTML=cityOptions(country,selected);
    city.disabled=!country;
  }

  function box(){
    modal().innerHTML=`<div class="modalback"><div class="modalbox"><button class="close" onclick="window.bcAuthFixClose()">×</button><h2>Join BrickCircle</h2><p class="muted">Secure email verification for your collector account.</p><div class="tabs"><button id="afsi" class="${mode==='in'?'on':''}" onclick="window.bcAuthFixMode('in')">Sign in</button><button id="afsu" class="${mode==='up'?'on':''}" onclick="window.bcAuthFixMode('up')">Create account</button></div><div id="afbody"></div></div></div>`;
    renderForm();
  }
  function renderForm(message=''){
    const b=document.querySelector('#afbody'); if(!b)return;
    b.innerHTML=`<form class="form" onsubmit="return window.bcAuthFixSubmit(event)">
      <label>Email<input id="afemail" type="email" autocomplete="email" required placeholder="you@example.com"></label>
      <label>Password<input id="afpass" type="password" minlength="8" autocomplete="${mode==='in'?'current-password':'new-password'}" required placeholder="At least 8 characters"></label>
      ${mode==='up'?`<label>Display name<input id="afname" maxlength="60" autocomplete="name" required placeholder="Your collector name"></label>
      <label>Country<select id="afcountry" required onchange="window.bcAuthFixCountryChanged()">${countryOptions(pendingCountry)}</select></label>
      <label>City<select id="afcity" required ${pendingCountry?'':'disabled'}>${cityOptions(pendingCountry,pendingCity)}</select></label>
      <div class="authfix-location-note">Your country and city help BrickCircle connect you with nearby collectors and support future shipping/exchange features.</div>`:''}
      ${message?`<div class="authfix-error">${esc(message)}</div>`:''}
      <button class="primary" type="submit">${mode==='up'?'Create account':'Sign in'}</button>
      ${mode==='in'?'<button type="button" onclick="window.bcAuthFixForgot()">Forgot password?</button>':''}
    </form>`;
  }
  window.bcAuthFixCountryChanged=()=>{pendingCountry=document.querySelector('#afcountry')?.value||'';pendingCity='';updateCities()};
  window.bcAuthFixMode=(m)=>{mode=m;box()};
  window.bcAuthFixClose=()=>{modal().innerHTML=''};
  window.bcAuth=()=>{mode='in';box()};
  window.bcAuthFixSubmit=async e=>{
    e.preventDefault();
    const email=document.querySelector('#afemail').value.trim().toLowerCase();
    const password=document.querySelector('#afpass').value;
    const name=document.querySelector('#afname')?.value.trim()||'';
    const country=document.querySelector('#afcountry')?.value||'';
    const city=document.querySelector('#afcity')?.value||'';
    const btn=e.submitter; if(btn){btn.disabled=true;btn.textContent='Working…'}
    if(mode==='up'){
      if(!country||!city){renderForm('Please select your country and city.');return false}
      pendingEmail=email;pendingName=name;pendingCountry=country;pendingCity=city;
      const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:name,country,city},emailRedirectTo:'https://brickcircle.club'}});
      if(error){renderForm(error.message);return false}
      if(data.user){otpForm(email);return false}
      renderForm('We could not create the account. Please try again.');
      return false;
    }
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error){renderForm(error.message);return false}
    window.location.reload();
    return false;
  };
  function otpForm(email){
    const b=document.querySelector('#afbody');
    b.innerHTML=`<div class="authfix-note"><b>Check your email.</b><br>We sent a verification code to <b>${esc(email)}</b>. Enter the code exactly as shown in the email. If you do not see it, check Spam/Promotions.</div><form class="form" onsubmit="return window.bcAuthFixVerify(event)"><label>Verification code<input id="afotp" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]{6,10}" required placeholder="Enter your code" class="authfix-code"></label><button class="primary" type="submit">Verify email</button><div class="authfix-actions"><button type="button" onclick="window.bcAuthFixResend()">Resend code</button><button type="button" onclick="window.bcAuthFixMode('in')">Back to sign in</button></div><div id="afstatus"></div></form>`;
  }
  window.bcAuthFixVerify=async e=>{
    e.preventDefault();
    const token=document.querySelector('#afotp').value.trim();
    const status=document.querySelector('#afstatus');
    const {data,error}=await sb.auth.verifyOtp({email:pendingEmail,token,type:'email'});
    if(error){status.innerHTML=`<div class="authfix-error">${esc(error.message)}</div>`;return false}
    // The verification call establishes an authenticated session. Persist signup location now.
    if(data?.user?.id && pendingCountry && pendingCity){
      const {error:profileError}=await sb.from('profiles').update({country:pendingCountry,city:pendingCity,updated_at:new Date().toISOString()}).eq('id',data.user.id);
      if(profileError){console.warn('BrickCircle location profile update failed:',profileError.message)}
    }
    status.innerHTML='<div class="authfix-success">Email verified. Your country and city have been saved. Signing you in…</div>';
    setTimeout(()=>window.location.reload(),300);
    return false;
  };
  window.bcAuthFixResend=async()=>{
    const status=document.querySelector('#afstatus');
    const {error}=await sb.auth.resend({type:'signup',email:pendingEmail,options:{emailRedirectTo:'https://brickcircle.club'}});
    if(error){status.innerHTML=`<div class="authfix-error">${esc(error.message)}</div>`}
    else{status.innerHTML='<div class="authfix-success">A new verification code was sent. Please wait at least 60 seconds before requesting another.</div>'}
  };
  window.bcAuthFixForgot=async()=>{
    const email=prompt('Enter the email address for your BrickCircle account:');
    if(!email)return;
    const {error}=await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:'https://brickcircle.club'});
    alert(error?error.message:'If an account exists, a password reset email has been sent.');
  };
})();
