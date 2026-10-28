'use strict';

/*
 * User management page demo for the Fire Alarm Monitoring application.
 * This file deliberately uses mock data only. Replace DemoRepository methods
 * with the real authenticated API after matching the endpoint contracts in
 * the existing server implementation.
 */

const ICONS = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  building:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2m2 0h2M9 11h2m2 0h2M9 15h2m2 0h2M10 21v-3h4v3"/>',
  panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h4m-4 4h7"/><circle cx="17" cy="15" r="1"/>',
  map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15m6-12v15"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  chart:'<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 6-7"/>',
  radio:'<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 6 12 2l4 4M8 11h8m-8 4h4"/><circle cx="17" cy="16" r="1"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  'filter-x':'<path d="M4 5h16M7 12h10m-7 7h4"/><path d="m16 10 5 5m0-5-5 5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  'search-x':'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5m-11-12 3.5 3.5M13.5 9 10 12.5"/>',
  'user-check':'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  pencil:'<path d="m15 5 4 4M4 20l4-.8L20 7a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>',
  shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  'shield-check':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  'shield-alert':'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="M12 8v4m0 4h.01"/>',
  'shield-off':'<path d="m3 3 18 18M12 22s8-4 8-11V5l-8-3-4 1.5M4 7v4c0 2 .7 4 1.7 5.6"/>',
  'chevron-down':'<path d="m6 9 6 6 6-6"/>',
  'chevron-left':'<path d="m14 6-6 6 6 6"/>',
  'chevron-right':'<path d="m10 6 6 6-6 6"/>',
  'arrow-right':'<path d="M19 12H5m7 7-7-7 7-7"/>',
  'arrow-left':'<path d="M5 12h14m-7-7 7 7-7 7"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.2 1.8c-1 .8-1.8 1.2-1.8 2.7m0 3h.01"/>',
  'mail-check':'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6m-7 8 2 2 4-4"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  at:'<circle cx="12" cy="12" r="9"/><path d="M16 12a4 4 0 1 1-1.2-2.8V12a2 2 0 0 0 4 0 7 7 0 1 0-2 5"/>',
  'user-round':'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  phone:'<path d="M7 3H5a2 2 0 0 0-2 2c0 8.8 7.2 16 16 16a2 2 0 0 0 2-2v-2l-5-2-2 3a14 14 0 0 1-6-6l3-2-2-5Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  key:'<circle cx="8" cy="15" r="5"/><path d="m12 11 8-8m-3 3 2 2m-5 1 2 2"/>',
  'key-round':'<circle cx="8" cy="15" r="5"/><path d="m12 11 8-8m-3 3 2 2m-5 1 2 2"/>',
  'folder-plus':'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M12 11v6m-3-3h6"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  'folder-x':'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="m9 11 6 6m0-6-6 6"/>',
  'radio-tower':'<path d="M12 13v8m-4 0h8M8.5 8.5a5 5 0 0 0 0 7m7-7a5 5 0 0 1 0 7M5.7 5.7a9 9 0 0 0 0 12.6m12.6-12.6a9 9 0 0 1 0 12.6"/><circle cx="12" cy="11" r="1"/>',
  'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  'minus-circle':'<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  'circle-check':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  'circle-dot':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  'alert-triangle':'<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
  flame:'<path d="M12 22c5 0 8-3.4 8-8 0-3-1.5-5-4-7-.1 2-1.2 3.2-2 4-1-4-3-6-5-8 0 4-1 6-3 9-2 4 1 10 6 10Z"/><path d="M10 18c0-2 1.5-3.5 3-5 1.5 2 2 3 2 4a3.5 3.5 0 0 1-7 0"/>',
  activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  'calendar-clock':'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18"/><circle cx="12" cy="15" r="3"/><path d="M12 13v2l1 1"/>',
  'clipboard-check':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6V7H9zM8 14l2.5 2.5L16 11"/>',
  'sliders-horizontal':'<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  'filter':'<path d="M4 5h16M7 12h10m-7 7h4"/>',
  'filter-x':'<path d="M4 5h16M7 12h10m-7 7h4M16 10l5 5m0-5-5 5"/>',
  'user-plus':'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M19 8v6m-3-3h6"/>',
  'user-minus':'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M16 11h6"/>',
  'chart-no-axes-combined':'<path d="M3 3v18h18"/><path d="m6 14 4-4 4 3 5-7"/>',
  'file-text':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h8"/>',
  'file-down':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 12v6m-3-3 3 3 3-3"/>',
  save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  x:'<path d="m18 6-12 12M6 6l12 12"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  'calendar-range':'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18M7 13h3m4 0h3M7 17h3"/>',
  'map-pin':'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  'log-in':'<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
  'log-out':'<path d="m14 7 5 5-5 5m5-5H7"/><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/>',
  'lock-keyhole':'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2"/>',
  'settings-2':'<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  'external-link':'<path d="M14 3h7v7m0-7L10 14"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  'more-horizontal':'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  trash:'<path d="M3 6h18m-2 0-1 14H6L5 6m4 0V3h6v3m-5 4v6m4-6v6"/>',
  'refresh-cw':'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2"/>',
  'message-square':'<path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',
  'hard-drive':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18M7 8h.01M11 8h.01"/>',
  'hand':'<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v8-4a1.5 1.5 0 0 1 3 0v7c0 4-2.5 6-6 6h-3c-2 0-3.5-1-4.5-2.5L3 14a1.7 1.7 0 0 1 2.5-2.2Z"/>',
  'volume-2':'<path d="M11 5 6 9H3v6h3l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5m-18 5 9 5 9-5"/>',
  'mouse-pointer-2':'<path d="m5 3 14 10-7 1-3 7Z"/>',
  'file-up':'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 18v-6m-3 3 3-3 3 3"/>',
  'circle-help':'<circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.2 1.8c-1 .8-1.8 1.2-1.8 2.7m0 3h.01"/>',
  'calendar-days':'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/>'
};
function icon(name, cls='') { return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`; }
function hydrateIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);}); }

const projects = [
  {id:'opal',name:'مرکز خرید اپال',location:'تهران، سعادت‌آباد',type:'مرکز تجاری',panels:[{id:'opal-main',name:'پنل ورودی اصلی',code:'OPL-001',area:'همکف'},{id:'opal-parking',name:'پنل پارکینگ',code:'OPL-002',area:'پارکینگ B2'},{id:'opal-office',name:'پنل طبقات اداری',code:'OPL-003',area:'طبقات ۱ تا ۵'}]},
  {id:'aftab',name:'ساختمان اداری آفتاب',location:'تهران، ونک',type:'ساختمان اداری',panels:[{id:'aftab-ground',name:'پنل طبقه همکف',code:'AFT-001',area:'همکف'},{id:'aftab-basement',name:'پنل زیرزمین',code:'AFT-002',area:'زیرزمین'}]},
  {id:'pars',name:'مجتمع صنعتی پارس',location:'کرج، شهرک صنعتی',type:'مجتمع صنعتی',panels:[{id:'pars-main',name:'پنل ورودی کارخانه',code:'PRS-001',area:'ساختمان اصلی'},{id:'pars-warehouse',name:'پنل انبار',code:'PRS-002',area:'انبار شماره ۱'}]}
];
const users = [
  {id:'u1',name:'علی محمدی',username:'ali.m',email:'ali@example.com',phone:'۰۹۱۲ ۱۲۳ ۴۵۶۷',status:'active',last:'امروز، ۱۳:۴۲',created:'۱۴۰۵/۰۷/۱۰'},
  {id:'u2',name:'رضا احمدی',username:'reza.a',email:'reza@example.com',phone:'۰۹۱۲ ۲۳۴ ۵۶۷۸',status:'active',last:'امروز، ۱۳:۳۱',created:'۱۴۰۵/۰۷/۱۸'},
  {id:'u3',name:'مهدی رضایی',username:'mahdi.r',email:'mahdi@example.com',phone:'ثبت نشده',status:'invited',last:'هنوز وارد نشده',created:'۱۴۰۵/۰۸/۰۱'},
  {id:'u4',name:'سارا کریمی',username:'sara.k',email:'sara@example.com',phone:'۰۹۳۵ ۶۷۸ ۱۲۳۴',status:'disabled',last:'۲۲ مهر ۱۴۰۵',created:'۱۴۰۵/۰۶/۲۵'}
];
const globalPermissionDefs = [
  {id:'manageUsers',label:'مدیریت حساب‌های کاربران',desc:'ایجاد، ویرایش و غیرفعال‌سازی حساب‌ها'},
  {id:'createProjects',label:'ایجاد پروژه',desc:'ساخت پروژه‌های جدید در سامانه'},
  {id:'viewActivity',label:'مشاهده گزارش فعالیت سراسری',desc:'مشاهده سوابق فعالیت تمام محدوده‌های مجاز'},
  {id:'manageGlobalAccess',label:'واگذاری اختیارات سراسری',desc:'واگذاری مجوزهای سراسری در محدوده مجاز'}
];
const projectPermissionDefs = [
  {id:'editInfo',label:'ویرایش اطلاعات پروژه'},
  {id:'managePanels',label:'مدیریت فهرست پنل‌ها'},
  {id:'viewMembers',label:'مشاهده اعضای پروژه'},
  {id:'manageMembers',label:'مدیریت اعضای پروژه'},
  {id:'grantAccess',label:'تخصیص و لغو دسترسی اعضا'},
  {id:'viewActivity',label:'مشاهده سوابق فعالیت پروژه'}
];
function emptyProjectAccess(){return {assigned:false,panels:{},permissions:Object.fromEntries(projectPermissionDefs.map(p=>[p.id,false]))};}
function emptyProfile(){return {global:Object.fromEntries(globalPermissionDefs.map(p=>[p.id,false])),projects:Object.fromEntries(projects.map(p=>[p.id,{...emptyProjectAccess(),panels:Object.fromEntries(p.panels.map(panel=>[panel.id,false]))}]))};}
function makeProfile(assignments={}, global={}) {
  const profile=emptyProfile(); profile.global={...profile.global,...global};
  for(const [projectId, data] of Object.entries(assignments)){
    if(!profile.projects[projectId]) continue;
    profile.projects[projectId].assigned=Boolean(data.assigned);
    profile.projects[projectId].panels={...profile.projects[projectId].panels,...(data.panels||{})};
    profile.projects[projectId].permissions={...profile.projects[projectId].permissions,...(data.permissions||{})};
  }
  return profile;
}
let profiles={
  u1:makeProfile({opal:{assigned:true,panels:{'opal-main':true,'opal-parking':true,'opal-office':true},permissions:{editInfo:true,managePanels:true,viewMembers:true,manageMembers:true,grantAccess:true,viewActivity:true}},aftab:{assigned:true,panels:{'aftab-ground':true,'aftab-basement':true},permissions:{editInfo:true,managePanels:false,viewMembers:true,manageMembers:true,grantAccess:false,viewActivity:true}},pars:{assigned:true,panels:{'pars-main':true,'pars-warehouse':true},permissions:{viewMembers:true,viewActivity:true}}},{manageUsers:true,createProjects:true,viewActivity:true,manageGlobalAccess:true}),
  u2:makeProfile({opal:{assigned:true,panels:{'opal-main':true,'opal-parking':true,'opal-office':false},permissions:{viewMembers:true}}}),
  u3:makeProfile({pars:{assigned:true,panels:{'pars-main':true,'pars-warehouse':true}}}),
  u4:makeProfile({aftab:{assigned:true,panels:{'aftab-ground':true,'aftab-basement':false}}})
};
let activities=[
  {id:'act1',date:'۱۴۰۵/۰۸/۰۲',time:'۱۴:۰۲:۱۸',actor:'علی محمدی',target:'پنل پارکینگ',action:'مشاهده رویداد پنل',category:'panel',projectId:'opal',panelId:'opal-parking',result:'success',detail:'کاربر رویدادهای ثبت‌شده پنل پارکینگ را مشاهده کرده است.',before:'—',after:'درخواست مشاهده موفق بود.'},
  {id:'act2',date:'۱۴۰۵/۰۸/۰۲',time:'۱۳:۴۲:۵۱',actor:'مدیر سامانه',target:'مهدی رضایی',action:'تخصیص پروژه',category:'access',projectId:'pars',panelId:null,result:'success',detail:'پروژه به حساب کاربر اختصاص یافت؛ دسترسی پنل‌ها مستقل از پروژه تعیین می‌شود.',before:'بدون عضویت پروژه',after:'عضویت پروژه ثبت شد.'},
  {id:'act3',date:'۱۴۰۵/۰۸/۰۲',time:'۱۳:۳۱:۱۱',actor:'رضا احمدی',target:'رضا احمدی',action:'ورود ناموفق',category:'login',projectId:null,panelId:null,result:'failure',detail:'تلاش ورود با اعتبارنامه نامعتبر.',before:'بدون نشست',after:'ورود رد شد.'},
  {id:'act4',date:'۱۴۰۵/۰۸/۰۲',time:'۱۲:۱۸:۰۹',actor:'مدیر پروژه اپال',target:'پنل ورودی اصلی',action:'تغییر تنظیمات پنل',category:'panel',projectId:'opal',panelId:'opal-main',result:'success',detail:'تغییر تنظیمات در گزارش نمونه ثبت شده است.',before:'مقادیر قبلی تنظیمات',after:'مقادیر جدید ثبت شدند.'},
  {id:'act5',date:'۱۴۰۵/۰۸/۰۱',time:'۱۷:۰۸:۴۰',actor:'مدیر سامانه',target:'رضا احمدی',action:'لغو دسترسی پنل',category:'access',projectId:'opal',panelId:'opal-office',result:'success',detail:'دسترسی به پنل موردنظر لغو شد.',before:'دسترسی کامل',after:'بدون دسترسی.'},
  {id:'act6',date:'۱۴۰۵/۰۸/۰۱',time:'۱۶:۲۵:۱۳',actor:'مدیر سامانه',target:'سارا کریمی',action:'غیرفعال‌سازی حساب',category:'account',projectId:null,panelId:null,result:'success',detail:'حساب کاربر غیرفعال شد.',before:'فعال',after:'غیرفعال'}
];
const state={page:'list',selectedUserId:'u3',userTab:'info',accessDraft:null,accessBaseline:null,accessExpanded:{},reviewOpen:false,activitySelected:null,filters:{search:'',status:'all',project:'all'},activityFilters:{search:'',category:'all',result:'all',project:'all',panel:'all'},mobileNav:false};
const el=id=>document.getElementById(id);
const userById=id=>users.find(u=>u.id===id);
const projectById=id=>projects.find(p=>p.id===id);
const panelById=id=>projects.flatMap(p=>p.panels.map(panel=>({...panel,projectId:p.id,projectName:p.name}))).find(panel=>panel.id===id);
const profileById=id=>profiles[id]||(profiles[id]=emptyProfile());
const faNumber=n=>String(n).replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const initials=name=>String(name||'؟').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusLabel=status=>({active:'فعال',invited:'در انتظار فعال‌سازی',disabled:'غیرفعال'}[status]||status);
const statusClass=status=>({active:'status-active',invited:'status-invited',disabled:'status-disabled'}[status]||'status-disabled');
function toast(message,type='success'){
  const node=document.createElement('div');node.className=`toast ${type}`;node.innerHTML=`${icon(type==='error'?'alert-triangle':type==='info'?'info':'check-circle')}<span>${esc(message)}</span>`;el('toastRegion').appendChild(node);setTimeout(()=>node.remove(),4100);
}
function pushActivity({actor='مدیر سامانه',target,action,category='account',projectId=null,panelId=null,result='success',detail,before='—',after='—'}){
  const date=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const time=new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
  activities.unshift({id:'act'+(Date.now()),date,time,actor,target,action,category,projectId,panelId,result,detail,before,after});
}

function go(page){state.page=page;state.reviewOpen=false;state.mobileNav=false;render();}
function openUser(userId,tab='info'){state.selectedUserId=userId;state.userTab=tab;go('detail');}
function openAccess(userId=state.selectedUserId){state.selectedUserId=userId;state.accessDraft=JSON.parse(JSON.stringify(profileById(userId)));state.accessBaseline=JSON.parse(JSON.stringify(profileById(userId)));state.accessExpanded={};state.reviewOpen=false;go('access');}
function listAllowedProjectIds(userId){return projects.filter(p=>profileById(userId).projects[p.id]?.assigned).map(p=>p.id);}
function countAssignedPanels(userId){const profile=profileById(userId);return projects.reduce((sum,p)=>sum+(profile.projects[p.id]?.assigned?p.panels.filter(panel=>profile.projects[p.id].panels[panel.id]).length:0),0);}
function countAdminPermissions(userId){const profile=profileById(userId);return Object.values(profile.global).filter(Boolean).length+projects.reduce((sum,p)=>sum+(profile.projects[p.id]?.assigned?Object.values(profile.projects[p.id].permissions).filter(Boolean).length:0),0);}
function renderList(){
  const filtered=users.filter(user=>{
    const q=state.filters.search.trim().toLowerCase();
    const matchText=!q||[user.name,user.username,user.email].join(' ').toLowerCase().includes(q);
    const matchStatus=state.filters.status==='all'||user.status===state.filters.status;
    const matchProject=state.filters.project==='all'||profileById(user.id).projects[state.filters.project]?.assigned;
    return matchText&&matchStatus&&matchProject;
  });
  el('totalUsers').textContent=faNumber(users.length);el('activeUsers').textContent=faNumber(users.filter(u=>u.status==='active').length);
  el('resultCount').textContent=`${faNumber(filtered.length)} کاربر`;
  el('tableSummary').textContent=`نمایش ${faNumber(filtered.length)} کاربر از ${faNumber(users.length)} حساب`;
  const tbody=el('usersTableBody');tbody.innerHTML=filtered.map(user=>{
    const pCount=listAllowedProjectIds(user.id).length;const panelCount=countAssignedPanels(user.id);const adminCount=countAdminPermissions(user.id);
    return `<tr>
      <td data-label="کاربر"><div class="user-cell"><div class="avatar">${esc(initials(user.name))}</div><div><strong>${esc(user.name)}</strong><small>${esc(user.username)}</small></div></div></td>
      <td data-label="وضعیت حساب"><span class="status-pill ${statusClass(user.status)}">${statusLabel(user.status)}</span></td>
      <td data-label="پروژه‌ها"><span class="count-chip">${faNumber(pCount)} پروژه</span></td>
      <td data-label="پنل‌های مجاز"><span class="count-chip">${faNumber(panelCount)} پنل</span></td>
      <td data-label="اختیارات مدیریتی"><span class="permission-summary">${icon(adminCount?'shield-check':'shield')} ${adminCount?`${faNumber(adminCount)} مجوز`: 'بدون اختیار مدیریتی'}</span></td>
      <td data-label="آخرین فعالیت"><span class="last-activity">${esc(user.last||'ثبت نشده')}</span></td>
      <td data-label="عملیات"><div class="row-actions"><button class="icon-action" data-action="details" data-id="${user.id}" title="جزئیات کاربر" aria-label="جزئیات کاربر">${icon('eye')}</button><button class="icon-action" data-action="access" data-id="${user.id}" title="مدیریت دسترسی" aria-label="مدیریت دسترسی">${icon('shield-check')}</button><button class="icon-action" data-action="edit" data-id="${user.id}" title="ویرایش اطلاعات" aria-label="ویرایش اطلاعات">${icon('pencil')}</button><button class="icon-action" data-action="more" data-id="${user.id}" title="عملیات بیشتر" aria-label="عملیات بیشتر">${icon('more-horizontal')}</button></div></td>
    </tr>`;
  }).join('');
  el('usersEmpty').classList.toggle('hidden',filtered.length>0);el('usersTableWrap').classList.toggle('hidden',filtered.length===0);
}
function renderDetail(){
  const user=userById(state.selectedUserId);if(!user){go('list');return;}
  const profile=profileById(user.id);const assignedProjects=projects.filter(p=>profile.projects[p.id]?.assigned);const panelCount=countAssignedPanels(user.id);const relevant=activities.filter(a=>a.actor===user.name||a.target===user.name||a.target===user.username);
  el('userDetailPage').innerHTML=`<button class="back-link" data-action="back-list">${icon('arrow-right')} بازگشت به فهرست کاربران</button>
    <div class="page-title"><div class="eyebrow">مدیریت سامانه / کاربران</div><h1>جزئیات کاربر</h1><p>اطلاعات حساب، محدوده دسترسی و سوابق فعالیت کاربر را بررسی کنید.</p></div>
    <div class="profile-head"><div class="avatar avatar-large">${esc(initials(user.name))}</div><div class="profile-main"><div class="profile-name-row"><h1>${esc(user.name)}</h1><span class="status-pill ${statusClass(user.status)}">${statusLabel(user.status)}</span></div><p>${esc(user.username)}${user.email?' · '+esc(user.email):''}</p><div class="profile-actions"><button class="btn btn-secondary" data-action="edit" data-id="${user.id}">${icon('pencil')} ویرایش اطلاعات</button><button class="btn btn-primary" data-action="access" data-id="${user.id}">${icon('shield-check')} مدیریت دسترسی</button><button class="btn btn-secondary" data-action="reset-password" data-id="${user.id}">${icon('key-round')} بازنشانی رمز</button></div></div></div>
    <div class="profile-stats"><div class="mini-stat"><span>پروژه‌های مجاز</span><strong>${faNumber(assignedProjects.length)}</strong></div><div class="mini-stat"><span>پنل‌های دارای دسترسی</span><strong>${faNumber(panelCount)}</strong></div><div class="mini-stat"><span>اختیارات مدیریتی</span><strong>${faNumber(countAdminPermissions(user.id))}</strong></div></div>
    <div class="tabs" role="tablist"><button class="tab-button ${state.userTab==='info'?'active':''}" data-tab="info">${icon('user-round')} اطلاعات</button><button class="tab-button ${state.userTab==='projects'?'active':''}" data-tab="projects">${icon('building')} پروژه‌ها و پنل‌ها</button><button class="tab-button ${state.userTab==='permissions'?'active':''}" data-tab="permissions">${icon('shield-check')} مجوزها</button><button class="tab-button ${state.userTab==='activity'?'active':''}" data-tab="activity">${icon('history')} سوابق فعالیت</button></div>
    <div id="userTabContent" class="tab-panel">${renderUserTab(user,profile,assignedProjects,relevant)}</div>`;
}
function renderUserTab(user,profile,assignedProjects,relevant){
  if(state.userTab==='info'){
    const rows=[['user-round','نام نمایشی',user.name],['at','نام کاربری',user.username],['mail','ایمیل',user.email||'ثبت نشده'],['phone','شماره تماس',user.phone||'ثبت نشده'],['shield-check','وضعیت حساب',statusLabel(user.status)],['calendar-days','تاریخ ایجاد حساب',user.created||'ثبت نشده'],['clock','آخرین ورود یا فعالیت',user.last||'ثبت نشده']];
    return `<section class="section-card"><div class="section-heading"><div><h2>اطلاعات حساب کاربری</h2><p class="section-subtitle">شناسه ورود و اطلاعات پایه این حساب</p></div><button class="btn btn-secondary btn-small" data-action="edit" data-id="${user.id}">${icon('pencil')} ویرایش</button></div><div class="info-grid">${rows.map(([ic,label,val])=>`<div class="info-row"><div class="info-icon">${icon(ic)}</div><div><span class="info-label">${label}</span><span class="info-value">${esc(val)}</span></div></div>`).join('')}</div></section>
      <section class="section-card"><div class="section-heading"><div><h2>امنیت حساب</h2><p class="section-subtitle">رمز عبور به دلایل امنیتی قابل مشاهده نیست.</p></div></div><div class="inline-actions"><button class="btn btn-secondary" data-action="reset-password" data-id="${user.id}">${icon('key-round')} بازنشانی رمز عبور</button><button class="btn ${user.status==='disabled'?'btn-primary':'btn-danger'}" data-action="toggle-status" data-id="${user.id}">${icon(user.status==='disabled'?'check-circle':'lock-keyhole')} ${user.status==='disabled'?'فعال‌سازی حساب':'غیرفعال‌سازی حساب'}</button></div></section>`;
  }
  if(state.userTab==='projects'){
    if(!assignedProjects.length)return `<section class="section-card"><div class="empty-state"><div class="empty-icon">${icon('folder-x')}</div><h3>پروژه‌ای اختصاص داده نشده است</h3><p>برای تعیین محدوده دسترسی، مدیریت دسترسی را باز کنید.</p><button class="btn btn-primary" data-action="access" data-id="${user.id}">${icon('shield-check')} مدیریت دسترسی</button></div></section>`;
    return `${assignedProjects.map(p=>{const pa=profile.projects[p.id];const panels=p.panels.filter(panel=>pa.panels[panel.id]);return `<article class="project-access-card"><div class="project-access-head"><div class="project-icon">${icon('building')}</div><div class="project-access-main"><strong>${esc(p.name)}</strong><small>${esc(p.location)} · ${faNumber(panels.length)} پنل دارای دسترسی</small></div><span class="status-pill status-active">مجاز</span></div><div class="project-access-body"><div class="divider"></div><div class="section-subtitle">پنل‌های دارای دسترسی کامل</div>${panels.length?panels.map(panel=>`<div class="panel-access-row"><div class="panel-symbol">${icon('radio-tower')}</div><div class="panel-access-copy"><strong>${esc(panel.name)}</strong><small>${esc(panel.code)} · ${esc(panel.area)}</small></div><span class="panel-access-status">${icon('check-circle')} دسترسی کامل</span></div>`).join(''):'<div class="subtle-box">در این پروژه پنلی به کاربر اختصاص داده نشده است.</div>'}</div></article>`}).join('')}<button class="btn btn-primary" data-action="access" data-id="${user.id}">${icon('shield-check')} ویرایش پروژه‌ها و پنل‌ها</button>`;
  }
  if(state.userTab==='permissions'){
    const globalRows=globalPermissionDefs.map(p=>permissionView(p.label,profile.global[p.id],p.desc)).join('');
    const projectRows=assignedProjects.map(p=>{const pa=profile.projects[p.id];return `<section class="section-card"><div class="section-heading"><h2>${esc(p.name)}</h2><span class="count-chip">${faNumber(Object.values(pa.permissions).filter(Boolean).length)} اختیار</span></div><div class="permission-list">${projectPermissionDefs.map(item=>permissionView(item.label,pa.permissions[item.id])).join('')}</div></section>`}).join('');
    return `<section class="section-card"><div class="section-heading"><div><h2>اختیارات سراسری</h2><p class="section-subtitle">مجوزهای مربوط به کل سامانه</p></div></div><div class="permission-list">${globalRows}</div></section>${projectRows||'<div class="subtle-box">برای نمایش اختیارات پروژه‌ای، ابتدا پروژه‌ای به کاربر اختصاص بدهید.</div>'}<button class="btn btn-primary" data-action="access" data-id="${user.id}">${icon('shield-check')} ویرایش مجوزها</button>`;
  }
  const rows=relevant.slice(0,8);
  return `<section class="section-card"><div class="section-heading"><div><h2>سوابق فعالیت ${esc(user.name)}</h2><p class="section-subtitle">رویدادهایی که به این کاربر مرتبط هستند</p></div><button class="btn btn-secondary btn-small" data-action="user-activity" data-id="${user.id}">گزارش کامل ${icon('arrow-left')}</button></div>${rows.length?`<div class="activity-list">${rows.map(activityItem).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('history')}</div><h3>فعالیتی ثبت نشده است</h3><p>پس از شروع استفاده از سامانه، سوابق معتبر در این بخش نمایش داده می‌شوند.</p></div>`}</section>`;
}
function permissionView(label,allowed,desc='') {return `<div class="permission-row ${allowed?'allowed':'denied'}">${icon(allowed?'check-circle':'minus-circle')}<div><strong>${esc(label)}</strong>${desc?`<small>${esc(desc)}</small>`:''}</div></div>`;}
function activityItem(a){const p=projectById(a.projectId);const panel=panelById(a.panelId);return `<div class="activity-item"><div class="activity-icon">${icon(a.category==='access'?'shield-check':a.category==='login'?'log-in':a.category==='panel'?'radio-tower':'user-round')}</div><div class="activity-copy"><strong>${esc(a.action)}</strong><p>${esc(a.actor)} · هدف: ${esc(a.target)}</p><small>${esc(p?.name||'سراسری سامانه')}${panel?' · '+esc(panel.name):''} · ${esc(a.date)}، ${esc(a.time)}</small></div><span class="status-pill ${a.result==='success'?'status-active':'status-danger'}">${a.result==='success'?'موفق':'ناموفق'}</span></div>`;}

function renderAccess(){
  const user=userById(state.selectedUserId);if(!user){go('list');return;}
  const draft=state.accessDraft||JSON.parse(JSON.stringify(profileById(user.id)));const baseline=state.accessBaseline||JSON.parse(JSON.stringify(profileById(user.id)));
  const changes=diffProfiles(baseline,draft);
  el('accessPage').innerHTML=`<button class="back-link" data-action="back-detail">${icon('arrow-right')} بازگشت به جزئیات کاربر</button><div class="toolbar"><div><div class="eyebrow">کاربر / ${esc(user.username)}</div><h1>مدیریت دسترسی‌ها</h1><p>${esc(user.name)} · تعیین پروژه‌ها، پنل‌ها و اختیارات مدیریتی مستقل</p></div><div class="toolbar-actions"><button class="btn btn-secondary" data-action="cancel-access">${icon('x')} لغو تغییرات</button><button class="btn btn-primary" data-action="open-review" ${changes.total?'':'disabled'}>${icon('clipboard-check')} بازبینی تغییرات ${changes.total?`(${faNumber(changes.total)})`:''}</button></div></div>
    <div class="access-intro">${icon('shield-check')}<div><strong>دسترسی پنل ساده است: کامل یا بدون دسترسی</strong><p>اگر دسترسی یک پنل فعال باشد، کاربر به تمام تنظیمات و قابلیت‌های پشتیبانی‌شده آن پنل دسترسی دارد. این مجوز مستقل از اختیارات مدیریتی پروژه است.</p></div></div>
    <h2 class="access-section-title">۱. اختیارات سراسری سامانه</h2><section class="section-card"><p class="section-subtitle">این اختیارات بر محدوده کل سامانه اثر می‌گذارند و فقط توسط مدیر دارای اجازه واگذاری قابل تغییر هستند.</p>${globalPermissionDefs.map(p=>permissionCheckbox(p.label,p.desc,!!draft.global[p.id],`global:${p.id}`)).join('')}</section>
    <h2 class="access-section-title">۲. پروژه‌ها و پنل‌ها</h2><p class="section-subtitle">ابتدا پروژه را به کاربر اختصاص دهید؛ سپس پنل‌های مجاز را به‌صورت صریح انتخاب کنید.</p>
    ${projects.map(project=>{const pa=draft.projects[project.id];const assigned=!!pa?.assigned;const expanded=!!state.accessExpanded[project.id];return `<article class="project-access-card"><div class="project-access-head"><div class="project-icon">${icon('building')}</div><div class="project-access-main"><strong>${esc(project.name)}</strong><small>${esc(project.location)} · ${faNumber(project.panels.length)} پنل در پروژه</small></div><label class="checkbox-control"><input type="checkbox" data-access="project:${project.id}" ${assigned?'checked':''}> تخصیص پروژه</label></div>${assigned?`<div class="project-access-body"><div class="divider"></div><div class="section-heading"><div><h2>پنل‌های پروژه</h2><p class="section-subtitle">انتخاب هر پنل، دسترسی کامل همان پنل را اعطا می‌کند.</p></div><button class="btn btn-ghost btn-small" data-action="toggle-project-permissions" data-id="${project.id}">${icon('sliders-horizontal')} اختیارات مدیریتی ${expanded?'−':'+'}</button></div>${project.panels.map(panel=>`<div class="panel-access-row"><div class="panel-symbol">${icon('radio-tower')}</div><div class="panel-access-copy"><strong>${esc(panel.name)}</strong><small>${esc(panel.code)} · ${esc(panel.area)}</small></div><label class="checkbox-control"><input type="checkbox" data-access="panel:${project.id}:${panel.id}" ${pa.panels[panel.id]?'checked':''}> دسترسی کامل</label></div>`).join('')}${expanded?`<div class="permission-group"><h3>اختیارات مدیریتی پروژه</h3><p class="subtle-text">این مجوزها از دسترسی عملیاتی پنل‌ها مستقل‌اند. امکان واگذاری هر مجوز باید در سمت سرور بررسی شود.</p>${projectPermissionDefs.map(p=>permissionCheckbox(p.label,'',!!pa.permissions[p.id],`permission:${project.id}:${p.id}`)).join('')}</div>`:''}</div>`:`<div class="project-access-body"><div class="subtle-box">این پروژه به کاربر اختصاص ندارد. با فعال‌کردن پروژه، پنل‌ها همچنان به‌صورت پیش‌فرض بدون دسترسی خواهند بود.</div></div>`}</article>`}).join('')}
    ${state.reviewOpen?renderAccessReview(changes,user):''}`;
}
function permissionCheckbox(label,desc,checked,key){return `<label class="permission-check-row"><input type="checkbox" data-access="${esc(key)}" ${checked?'checked':''}><span><strong>${esc(label)}</strong>${desc?`<small>${esc(desc)}</small>`:''}</span></label>`;}
function diffProfiles(before,after){const result={added:[],removed:[],total:0};for(const p of projects){const b=before.projects[p.id]||emptyProjectAccess(),a=after.projects[p.id]||emptyProjectAccess();if(!b.assigned&&a.assigned)result.added.push({text:`افزودن پروژه «${p.name}»`,add:true});if(b.assigned&&!a.assigned)result.removed.push({text:`لغو پروژه «${p.name}» و تمام دسترسی‌های وابسته`,add:false});if(a.assigned){for(const panel of p.panels){if(!b.panels[panel.id]&&a.panels[panel.id])result.added.push({text:`دسترسی کامل به «${panel.name}» در ${p.name}`,add:true});if(b.panels[panel.id]&&!a.panels[panel.id])result.removed.push({text:`لغو دسترسی به «${panel.name}» در ${p.name}`,add:false});}for(const perm of projectPermissionDefs){if(!b.permissions[perm.id]&&a.permissions[perm.id])result.added.push({text:`افزودن «${perm.label}» در ${p.name}`,add:true});if(b.permissions[perm.id]&&!a.permissions[perm.id])result.removed.push({text:`لغو «${perm.label}» در ${p.name}`,add:false});}}}for(const perm of globalPermissionDefs){if(!before.global[perm.id]&&after.global[perm.id])result.added.push({text:`افزودن اختیار سراسری «${perm.label}»`,add:true});if(before.global[perm.id]&&!after.global[perm.id])result.removed.push({text:`لغو اختیار سراسری «${perm.label}»`,add:false});}result.total=result.added.length+result.removed.length;return result;}
function renderAccessReview(changes,user){return `<section class="review-box"><h2>بازبینی تغییرات</h2><p>قبل از ثبت، محدوده و نتیجه تغییرات را بررسی کنید. این نمونه تغییرات را فقط در حافظه صفحه ثبت می‌کند.</p>${changes.total?`<div class="change-list">${[...changes.added,...changes.removed].map(c=>`<div class="change-item ${c.add?'add':'remove'}">${icon(c.add?'plus':'x')}<span>${esc(c.text)}</span></div>`).join('')}</div>${changes.removed.length?`<div class="subtle-box" style="margin-top:12px">پس از لغو دسترسی در نسخه واقعی، درخواست‌های بعدی کاربر به منابع لغوشده باید در سمت سرور رد شوند.</div>`:''}`:'<div class="subtle-box">هیچ تغییری برای ثبت وجود ندارد.</div>'}<div class="review-actions"><button class="btn btn-primary" data-action="confirm-access" ${changes.total?'':'disabled'}>${icon('check-circle')} تأیید و ذخیره در نمونه</button><button class="btn btn-secondary" data-action="close-review">بازگشت به ویرایش</button></div></section>`;}

function renderActivity(){
  const filters=state.activityFilters;
  const filtered=activities.filter(a=>{const q=filters.search.toLowerCase().trim();const project=projectById(a.projectId),panel=panelById(a.panelId);return (!q||[a.actor,a.target,a.action,project?.name,panel?.name,a.detail].join(' ').toLowerCase().includes(q))&&(filters.category==='all'||a.category===filters.category)&&(filters.result==='all'||a.result===filters.result)&&(filters.project==='all'||a.projectId===filters.project)&&(filters.panel==='all'||(filters.panel==='none'?!a.panelId:a.panelId===filters.panel));});
  el('activityPage').innerHTML=`<div class="page-heading"><div><div class="eyebrow">مدیریت سامانه</div><h1>گزارش فعالیت</h1><p>بررسی ورودها، تغییر دسترسی‌ها و عملیات انجام‌شده در پروژه‌ها و پنل‌ها.</p></div><button class="btn btn-secondary" data-action="export-activity">${icon('file-down')} خروجی CSV</button></div>
    <div class="activity-kpis"><div class="activity-kpi"><span>کل رویدادهای نمونه</span><strong>${faNumber(activities.length)}</strong></div><div class="activity-kpi"><span>ورود ناموفق</span><strong>${faNumber(activities.filter(a=>a.category==='login'&&a.result==='failure').length)}</strong></div><div class="activity-kpi"><span>تغییرات دسترسی</span><strong>${faNumber(activities.filter(a=>a.category==='access').length)}</strong></div><div class="activity-kpi"><span>عملیات پنل</span><strong>${faNumber(activities.filter(a=>a.category==='panel').length)}</strong></div></div>
    <section class="section-card"><div class="section-heading"><div><h2>فیلتر رویدادها</h2><p class="section-subtitle">فیلترها فقط روی داده‌های نمونه این ماکت اعمال می‌شوند.</p></div><button class="btn btn-ghost btn-small" data-action="reset-activity-filters">${icon('filter-x')} پاک‌کردن فیلترها</button></div><div class="filter-bar"><label class="search-control">${icon('search')}<input type="search" data-activity-filter="search" value="${esc(filters.search)}" placeholder="کاربر، شرح، پروژه یا پنل"></label><label class="select-control"><span class="field-label">نوع فعالیت</span><select data-activity-filter="category"><option value="all">همه فعالیت‌ها</option><option value="login" ${filters.category==='login'?'selected':''}>ورود و خروج</option><option value="access" ${filters.category==='access'?'selected':''}>تغییر دسترسی</option><option value="panel" ${filters.category==='panel'?'selected':''}>عملیات پنل</option><option value="account" ${filters.category==='account'?'selected':''}>مدیریت حساب</option></select></label><label class="select-control"><span class="field-label">نتیجه</span><select data-activity-filter="result"><option value="all">همه نتایج</option><option value="success" ${filters.result==='success'?'selected':''}>موفق</option><option value="failure" ${filters.result==='failure'?'selected':''}>ناموفق</option></select></label><label class="select-control"><span class="field-label">پروژه</span><select data-activity-filter="project"><option value="all">همه پروژه‌ها</option><option value="none" ${filters.project==='none'?'selected':''}>سراسری سامانه</option>${projects.map(p=>`<option value="${p.id}" ${filters.project===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label></div><div class="filter-bar"><label class="select-control"><span class="field-label">پنل</span><select data-activity-filter="panel"><option value="all">همه پنل‌ها</option><option value="none" ${filters.panel==='none'?'selected':''}>بدون پنل مشخص</option>${projects.flatMap(p=>p.panels.map(panel=>`<option value="${panel.id}" ${filters.panel===panel.id?'selected':''}>${esc(panel.name)} · ${esc(p.name)}</option>`)).join('')}</select></label></div></section>
    <section class="section-card"><div class="section-heading"><div><h2>رویدادهای ثبت‌شده</h2><p class="section-subtitle">${faNumber(filtered.length)} نتیجه مطابق فیلترهای انتخاب‌شده</p></div></div>${filtered.length?`<div class="activity-list">${filtered.map(a=>`${activityItem(a)}${state.activitySelected===a.id?`<div class="activity-detail"><div class="detail-field"><span>شرح رویداد</span><strong>${esc(a.detail)}</strong></div><div class="detail-field"><span>پروژه / پنل</span><strong>${esc(projectById(a.projectId)?.name||'سراسری سامانه')}${panelById(a.panelId)?' · '+esc(panelById(a.panelId).name):''}</strong></div><div class="detail-field"><span>وضعیت قبل</span><strong>${esc(a.before||'—')}</strong></div><div class="detail-field"><span>وضعیت بعد</span><strong>${esc(a.after||'—')}</strong></div></div>`:''}<div style="text-align:left;margin-top:-8px;margin-bottom:8px"><button class="btn btn-ghost btn-small" data-action="activity-details" data-id="${a.id}">${state.activitySelected===a.id?'بستن جزئیات':'مشاهده جزئیات'} ${icon(state.activitySelected===a.id?'chevron-down':'chevron-left')}</button></div>`).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('search-x')}</div><h3>رویدادی پیدا نشد</h3><p>فیلترها را تغییر دهید یا جست‌وجو را پاک کنید.</p></div>`}</section>
    <div class="access-intro">${icon('info')}<div><strong>گزارش فعالیت با رویدادهای حریق متفاوت است</strong><p>این بخش برای ثبت اقدام کاربران و مدیران است. آلارم حریق و خطای واقعی تجهیزات در بخش رویدادهای پنل‌ها نمایش داده می‌شوند.</p></div></div>`;
}
function renderPlaceholder(page){const dict={dashboard:['نمای کلی','داشبورد خلاصه پروژه‌ها، وضعیت پنل‌ها و رویدادهای مهم.'],projects:['پروژه‌ها','فهرست مجموعه‌ها، اطلاعات پروژه و پنل‌های متعلق به هر پروژه.'],panels:['پنل‌ها','فهرست پنل‌های اعلام حریق، وضعیت ارتباط و دسترسی به جزئیات.'],floorplan:['نقشه و چیدمان','نقشه طبقات، جانمایی تجهیزات و نمایش شناسه دیوایس‌ها.'],events:['رویدادهای تجهیزات','رخدادهای حریق، خطا و سرویس تجهیزات.'],reports:['گزارش‌ها','گزارش‌های عملیاتی، وضعیت تجهیزات و سوابق پیکربندی.'],devices:['دستگاه‌های ESP','وضعیت gatewayها و ارتباط دستگاه‌ها.'],settings:['تنظیمات سامانه','تنظیمات عمومی، اطلاعات حساب و وضعیت سامانه.']};const [title,description]=dict[page]||dict.dashboard;el('placeholderPage').innerHTML=`<div class="page-title"><div class="eyebrow">سامانه مانیتورینگ</div><h1>${title}</h1><p>${description}</p></div><div class="placeholder-card"><div class="empty-icon">${icon('layout-dashboard')}</div><h2>پیش‌نمایش این بخش</h2><p>تمرکز این بسته روی صفحه مدیریت کاربران، مدیریت دسترسی‌ها و گزارش فعالیت است. این بخش صرفاً برای نمایش ساختار منو وجود دارد و جایگزین پیاده‌سازی عملیاتی صفحات موجود پروژه نیست.</p><div class="inline-actions" style="justify-content:center;margin-top:17px"><button class="btn btn-primary" data-action="go-users">رفتن به مدیریت کاربران</button><button class="btn btn-secondary" data-action="go-activity">گزارش فعالیت</button></div></div>`;}
function render(){
  document.querySelectorAll('.page-view').forEach(p=>p.classList.add('hidden'));
  const pageMap={list:'usersPage',detail:'userDetailPage',access:'accessPage',activity:'activityPage'};
  if(pageMap[state.page]){el(pageMap[state.page]).classList.remove('hidden');if(state.page==='list')renderList();if(state.page==='detail')renderDetail();if(state.page==='access')renderAccess();if(state.page==='activity')renderActivity();}
  else{el('placeholderPage').classList.remove('hidden');renderPlaceholder(state.page);}
  const pageLabels={list:'مدیریت کاربران',detail:'جزئیات کاربر',access:'مدیریت دسترسی‌ها',activity:'گزارش فعالیت',dashboard:'نمای کلی',projects:'پروژه‌ها',panels:'پنل‌ها',floorplan:'نقشه و چیدمان',events:'رویدادهای تجهیزات',reports:'گزارش‌ها',devices:'دستگاه‌های ESP',settings:'تنظیمات سامانه'};
  el('breadcrumbCurrent').textContent=pageLabels[state.page]||'مدیریت سامانه';
  document.querySelectorAll('[data-nav]').forEach(btn=>btn.classList.toggle('active',btn.dataset.nav===(state.page==='list'||state.page==='detail'||state.page==='access'?'users':state.page)));
  hydrateIcons(document);
}
function showModal(html){el('modalContent').innerHTML=html;el('modalBackdrop').classList.remove('hidden');hydrateIcons(el('modalContent'));const first=el('modalContent').querySelector('input,select,button');if(first)first.focus();}
function closeModal(){el('modalBackdrop').classList.add('hidden');el('modalContent').innerHTML='';}
function openUserForm(userId=null){
  const user=userId?userById(userId):null;const isEdit=!!user;
  showModal(`<div class="modal-header"><div><h2 id="modalTitle">${isEdit?'ویرایش اطلاعات کاربر':'افزودن کاربر جدید'}</h2><p>${isEdit?'اطلاعات حساب را اصلاح کنید.':'برای حساب جدید نام کاربری و رمز اولیه تعیین کنید.'}</p></div><button class="modal-close" data-action="close-modal" aria-label="بستن">${icon('x')}</button></div><form id="userForm"><div class="form-grid"><div class="form-field full"><label for="formName">نام نمایشی *</label><input id="formName" name="name" required maxlength="100" value="${esc(user?.name||'')}" placeholder="نام و نام خانوادگی"></div><div class="form-field"><label for="formUsername">نام کاربری *</label><input id="formUsername" name="username" required minlength="3" maxlength="50" pattern="[A-Za-z0-9._-]+" value="${esc(user?.username||'')}" placeholder="username" ${isEdit?'readonly':''}><p class="form-hint">حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط</p></div><div class="form-field"><label for="formEmail">ایمیل (اختیاری)</label><input id="formEmail" name="email" type="email" value="${esc(user?.email||'')}" placeholder="name@example.com"></div>${isEdit?'':`<div class="form-field"><label for="formPassword">رمز اولیه *</label><input id="formPassword" name="password" type="password" required minlength="10" autocomplete="new-password"><p class="form-hint">در نسخه واقعی رمز باید فقط در سرور هش شود.</p></div><div class="form-field"><label for="formPassword2">تأیید رمز اولیه *</label><input id="formPassword2" name="password2" type="password" required minlength="10" autocomplete="new-password"></div>`}<div class="form-field full"><label for="formPhone">شماره تماس (اختیاری)</label><input id="formPhone" name="phone" value="${esc(user?.phone==='ثبت نشده'?'':user?.phone||'')}" placeholder="شماره تماس"></div></div><div class="modal-actions"><button class="btn btn-primary" type="submit">${icon('check')} ${isEdit?'ذخیره اطلاعات':'ایجاد حساب نمونه'}</button><button class="btn btn-secondary" type="button" data-action="close-modal">انصراف</button></div></form>`);
  el('userForm').addEventListener('submit',event=>{
    event.preventDefault();const data=new FormData(event.currentTarget);const name=String(data.get('name')).trim();const username=String(data.get('username')).trim();const email=String(data.get('email')).trim();const phone=String(data.get('phone')).trim();
    if(!isEdit&&users.some(u=>u.username.toLowerCase()===username.toLowerCase())){toast('این نام کاربری قبلاً استفاده شده است.','error');return;}
    if(!isEdit){const pw=String(data.get('password')),pw2=String(data.get('password2'));if(pw!==pw2){toast('رمز عبور و تأیید آن یکسان نیستند.','error');return;}if(pw.length<10){toast('رمز اولیه باید دست‌کم ۱۰ نویسه داشته باشد.','error');return;}const id='u'+(Math.max(0,...users.map(u=>Number(u.id.slice(1))||0))+1);users.push({id,name,username,email,phone:phone||'ثبت نشده',status:'invited',last:'هنوز وارد نشده',created:new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())});profiles[id]=emptyProfile();pushActivity({target:name,action:'ایجاد حساب کاربری',category:'account',detail:'حساب نمونه ایجاد شد؛ رمز در ماکت ذخیره نشده است.',before:'—',after:'در انتظار فعال‌سازی'});closeModal();render();toast('کاربر در داده‌های همین نمونه ایجاد شد.');return;}
    Object.assign(user,{name,email,phone:phone||'ثبت نشده'});pushActivity({target:name,action:'ویرایش اطلاعات کاربر',category:'account',detail:'اطلاعات نمایشی حساب به‌روزرسانی شد.'});closeModal();render();toast('اطلاعات نمونه به‌روزرسانی شد.');
  });
}
function openResetPassword(userId){const user=userById(userId);if(!user)return;showModal(`<div class="modal-header"><div><h2 id="modalTitle">بازنشانی رمز عبور</h2><p>برای ${esc(user.name)} رمز اولیه جدیدی تعریف کنید.</p></div><button class="modal-close" data-action="close-modal">${icon('x')}</button></div><form id="resetPasswordForm"><div class="form-grid"><div class="form-field full"><label for="resetPassword">رمز اولیه جدید *</label><input id="resetPassword" type="password" minlength="10" required autocomplete="new-password"></div><div class="form-field full"><label for="resetPassword2">تأیید رمز *</label><input id="resetPassword2" type="password" minlength="10" required autocomplete="new-password"></div></div><p class="form-hint" style="margin-top:12px">ماکت رمز را ذخیره یا ارسال نمی‌کند. در سامانه واقعی، hash رمز باید در سرور ذخیره و نشست‌های قبلی کاربر بی‌اعتبار شوند.</p><div class="modal-actions"><button class="btn btn-primary" type="submit">تأیید بازنشانی</button><button class="btn btn-secondary" type="button" data-action="close-modal">انصراف</button></div></form>`);el('resetPasswordForm').addEventListener('submit',e=>{e.preventDefault();const a=el('resetPassword').value,b=el('resetPassword2').value;if(a!==b){toast('رمزها یکسان نیستند.','error');return;}if(a.length<10){toast('رمز عبور باید دست‌کم ۱۰ نویسه داشته باشد.','error');return;}pushActivity({target:user.name,action:'بازنشانی رمز عبور',category:'account',detail:'عملیات بازنشانی رمز در ماکت تأیید شد؛ رمز نگهداری نشده است.'});closeModal();toast('عملیات در نمونه تأیید شد؛ رمز واقعی تغییر نکرد.','info');render();});}
function toggleUserStatus(userId){const user=userById(userId);if(!user)return;const disable=user.status!=='disabled';showModal(`<div class="modal-header"><div><h2 id="modalTitle">${disable?'غیرفعال‌سازی حساب':'فعال‌سازی حساب'}</h2><p>${esc(user.name)}</p></div><button class="modal-close" data-action="close-modal">${icon('x')}</button></div><div class="subtle-box">${disable?'حساب کاربر غیرفعال می‌شود و در نسخه واقعی نشست‌های فعال او نیز باید بی‌اعتبار شوند.':'حساب دوباره فعال می‌شود؛ این عمل نباید مجوزهای لغوشده را بازگرداند.'}</div><div class="modal-actions"><button class="btn ${disable?'btn-danger':'btn-primary'}" data-action="confirm-status" data-id="${userId}">${disable?'غیرفعال‌سازی حساب':'فعال‌سازی حساب'}</button><button class="btn btn-secondary" data-action="close-modal">انصراف</button></div>`);}
function saveAccess(){const user=userById(state.selectedUserId);if(!user)return;const before=state.accessBaseline;const after=state.accessDraft;const changes=diffProfiles(before,after);profiles[user.id]=JSON.parse(JSON.stringify(after));user.last='همین لحظه';user.projectIds=listAllowedProjectIds(user.id);if(changes.total){pushActivity({target:user.name,action:'تغییر دسترسی کاربر',category:'access',detail:`${changes.total} تغییر مجوز در ماکت تأیید شد.`,before:'وضعیت قبلی دسترسی',after:'وضعیت جدید دسترسی'});}state.accessBaseline=JSON.parse(JSON.stringify(after));state.reviewOpen=false;render();toast('تغییرات فقط در داده‌های همین ماکت ثبت شدند.','info');}
function handleAccessChange(key,value){const draft=state.accessDraft;const [kind,projectId,subId]=key.split(':');if(kind==='global'){draft.global[projectId]=value;}else if(kind==='project'){const p=draft.projects[projectId];p.assigned=value;if(!value){for(const id of Object.keys(p.panels))p.panels[id]=false;for(const id of Object.keys(p.permissions))p.permissions[id]=false;}}else if(kind==='panel'){if(draft.projects[projectId]?.assigned)draft.projects[projectId].panels[subId]=value;}else if(kind==='permission'){if(draft.projects[projectId]?.assigned)draft.projects[projectId].permissions[subId]=value;}renderAccess();hydrateIcons(el('accessPage'));}
function exportCSV(){const lines=[['تاریخ','ساعت','عامل','هدف','عملیات','پروژه','پنل','نتیجه'],...activities.map(a=>[a.date,a.time,a.actor,a.target,a.action,projectById(a.projectId)?.name||'سراسری سامانه',panelById(a.panelId)?.name||'—',a.result==='success'?'موفق':'ناموفق'])];const csv='\uFEFF'+lines.map(line=>line.map(cell=>'"'+String(cell??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='user-activity-demo.csv';a.click();URL.revokeObjectURL(url);toast('گزارش نمونه دانلود شد.');}

/* Events: delegation keeps this page compatible with the existing vanilla-JS approach. */
document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-nav]');if(nav){const target=nav.dataset.nav;if(target==='users')go('list');else if(target==='activity')go('activity');else go(target);const side=el('sidebar');if(side.classList.contains('open'))side.classList.remove('open');return;}
  const tab=event.target.closest('[data-tab]');if(tab){state.userTab=tab.dataset.tab;renderDetail();hydrateIcons(el('userDetailPage'));return;}
  const actionButton=event.target.closest('[data-action]');if(!actionButton)return;const action=actionButton.dataset.action;const id=actionButton.dataset.id;
  switch(action){
    case 'details':openUser(id,'info');break;
    case 'access':openAccess(id);break;
    case 'edit':openUserForm(id);break;
    case 'more':{const user=userById(id);showModal(`<div class="modal-header"><div><h2 id="modalTitle">عملیات حساب کاربری</h2><p>${esc(user?.name||'')}</p></div><button class="modal-close" data-action="close-modal">${icon('x')}</button></div><div class="inline-actions"><button class="btn btn-secondary" data-action="toggle-status" data-id="${id}">${icon(user?.status==='disabled'?'check-circle':'lock-keyhole')} ${user?.status==='disabled'?'فعال‌سازی':'غیرفعال‌سازی'} حساب</button><button class="btn btn-secondary" data-action="reset-password" data-id="${id}">${icon('key-round')} بازنشانی رمز</button><button class="btn btn-secondary" data-action="user-activity" data-id="${id}">${icon('history')} سوابق فعالیت</button></div>`);break;}
    case 'reset-password':closeModal();openResetPassword(id);break;
    case 'toggle-status':closeModal();toggleUserStatus(id);break;
    case 'confirm-status':{const user=userById(id);if(user){const was=user.status;user.status=was==='disabled'?'active':'disabled';pushActivity({target:user.name,action:user.status==='disabled'?'غیرفعال‌سازی حساب':'فعال‌سازی حساب',category:'account',detail:'وضعیت حساب در ماکت تغییر کرد.',before:statusLabel(was),after:statusLabel(user.status)});closeModal();render();toast('وضعیت حساب نمونه تغییر کرد.','info');}break;}
    case 'close-modal':closeModal();break;
    case 'back-list':go('list');break;
    case 'back-detail':state.userTab='projects';go('detail');break;
    case 'cancel-access':state.accessDraft=JSON.parse(JSON.stringify(state.accessBaseline));state.reviewOpen=false;go('detail');toast('تغییرات ثبت‌نشده کنار گذاشته شدند.','info');break;
    case 'open-review':state.reviewOpen=true;renderAccess();break;
    case 'close-review':state.reviewOpen=false;renderAccess();break;
    case 'confirm-access':saveAccess();break;
    case 'toggle-project-permissions':state.accessExpanded[id]=!state.accessExpanded[id];renderAccess();break;
    case 'user-activity':{const user=userById(id);state.activityFilters.search=user?.name||'';go('activity');break;}
    case 'activity-details':state.activitySelected=state.activitySelected===id?null:id;renderActivity();hydrateIcons(el('activityPage'));break;
    case 'export-activity':exportCSV();break;
    case 'reset-activity-filters':state.activityFilters={search:'',category:'all',result:'all',project:'all',panel:'all'};renderActivity();hydrateIcons(el('activityPage'));break;
    case 'go-users':go('list');break;
    case 'go-activity':go('activity');break;
  }
});
document.addEventListener('change',event=>{
  const access=event.target.closest('[data-access]');if(access){handleAccessChange(access.dataset.access,access.checked);return;}
  if(event.target.matches('[data-activity-filter]')){state.activityFilters[event.target.dataset.activityFilter]=event.target.value;const cursor=event.target.dataset.activityFilter==='search'?event.target.selectionStart:null;renderActivity();hydrateIcons(el('activityPage'));if(cursor!==null){const input=el('activityPage').querySelector('[data-activity-filter="search"]');input.focus();input.setSelectionRange(cursor,cursor);}}
});
document.addEventListener('input',event=>{
  if(event.target.id==='userSearch'){state.filters.search=event.target.value;renderList();hydrateIcons(el('usersPage'));const input=el('userSearch');input.focus();input.setSelectionRange(input.value.length,input.value.length);}
});
el('statusFilter').addEventListener('change',e=>{state.filters.status=e.target.value;renderList();hydrateIcons(el('usersPage'));});
el('projectFilter').addEventListener('change',e=>{state.filters.project=e.target.value;renderList();hydrateIcons(el('usersPage'));});
el('resetFilters').addEventListener('click',resetUserFilters);el('emptyReset').addEventListener('click',resetUserFilters);
function resetUserFilters(){state.filters={search:'',status:'all',project:'all'};el('userSearch').value='';el('statusFilter').value='all';el('projectFilter').value='all';renderList();hydrateIcons(el('usersPage'));}
el('addUserButton').addEventListener('click',()=>openUserForm());
el('mobileMenu').addEventListener('click',()=>{el('sidebar').classList.toggle('open');let backdrop=document.querySelector('.mobile-backdrop');if(!backdrop){backdrop=document.createElement('div');backdrop.className='mobile-backdrop';document.body.appendChild(backdrop);backdrop.addEventListener('click',()=>{el('sidebar').classList.remove('open');backdrop.classList.remove('show')});}backdrop.classList.toggle('show',el('sidebar').classList.contains('open'));});
el('helpButton').addEventListener('click',()=>toast('برای اتصال این صفحه به پروژه اصلی، راهنمای README داخل بسته را مطالعه کنید.','info'));
el('modalBackdrop').addEventListener('click',event=>{if(event.target===el('modalBackdrop'))closeModal();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el('modalBackdrop').classList.contains('hidden'))closeModal();});

function initProjectFilter(){el('projectFilter').innerHTML='<option value="all">همه پروژه‌ها</option>'+projects.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');}
function init(){initProjectFilter();hydrateIcons(document);render();}
init();
