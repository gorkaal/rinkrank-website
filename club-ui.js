'use strict';
/* Display-only view of validated club JSON. All computations happen in the exporter. */
const $=id=>document.getElementById(id);
const profile=location.pathname.endsWith('/club.html');
const query=new URLSearchParams(location.search);
let dataset=null,activeRows=[],sortKey=profile?'leagueRank':'rank',sortAsc=true;
const fmt=(value,digits=1)=>value===null||value===undefined||!Number.isFinite(Number(value))?'—':Number(value).toFixed(digits);
const pct=value=>value===null||value===undefined?'—':fmt(value,1)+'%';
const record=t=>t.gp==null?'—':[t.w,t.l,t.t].join('–');
const goals=t=>t.gp==null?'—':t.gf+' / '+t.ga;
const columns=profile?[
  ['team','Team','text'],['leagueRank','League Rank','number'],['winPct','Win %','number'],
  ['percentile','Divisional Percentile','number'],['age','Age','text'],
  ['division','Division','text'],['gp','GP','number'],['record','W–L–T','text'],
  ['goals','GF / GA','text'],['pts','PTS','number'],
  ['powerRank','Power Rank','number'],['powerRating','Power Rating','number'],
  ['momentum','Momentum','number']
]:[
  ['rank','Club Rank','number'],['name','Club','text'],['winPct','Win %','number'],
  ['averagePercentile','Avg Divisional Percentile','number'],
  ['includedTeams','Teams','number'],['gp','GP','number'],['record','W–L–T','text'],
  ['goals','GF / GA','text'],['pts','PTS','number'],
  ['averageLeagueRank','Avg League Rank','number'],['averagePowerRank','Avg Power Rank','number'],
  ['averagePowerRating','Avg Power Rating','number'],['averageMomentum','Avg Momentum','number']
];
function displayValue(row,key){
  const t=profile?row:row.totals;
  if(key==='record')return record(t);
  if(key==='goals')return goals(t);
  if(key in row)return row[key];
  return t[key];
}
function sortRows(rows){
  return [...rows].sort((a,b)=>{
    const av=displayValue(a,sortKey),bv=displayValue(b,sortKey);
    if(av==null)return bv==null?0:1;
    if(bv==null)return -1;
    const type=columns.find(c=>c[0]===sortKey)?.[2];
    const cmp=type==='number'?Number(av)-Number(bv):String(av).localeCompare(String(bv));
    if(cmp)return sortAsc?cmp:-cmp;
    return String(a.team||a.name).localeCompare(String(b.team||b.name));
  });
}
function link(href,label){
  const a=document.createElement('a');a.href=href;a.textContent=label;a.className='name';return a;
}
function cell(tr,row,key){
  const td=document.createElement('td');
  const value=displayValue(row,key);
  if(profile&&key==='team'){
    td.append(link('./team.html?division='+encodeURIComponent(row.slug)+'&team='+encodeURIComponent(row.team),row.team));
  }else if(profile&&key==='division'){
    td.append(link('./index.html?division='+encodeURIComponent(row.slug),row.division));
  }else if(!profile&&key==='name'){
    td.append(link('./club.html?club='+encodeURIComponent(row.slug),row.name));
  }else if(!profile&&key==='rank'){
    td.textContent=value==null?'—':String(value);
  }else if(['winPct','percentile','averagePercentile'].includes(key)){
    td.textContent=pct(value);
  }else if(['powerRating','momentum','averagePowerRating','averageMomentum'].includes(key)){
    td.textContent=value==null?'—':(Number(value)>0?'+':'')+fmt(value,2);
    if(key==='momentum'||key==='averageMomentum')td.title='Four-game opponent-adjusted rating; not a rank change';
  }else if(['averageLeagueRank','averagePowerRank'].includes(key)){
    td.textContent=fmt(value,2);
  }else{
    td.textContent=value==null?'—':String(value);
  }
  tr.append(td);
}
function drawTable(){
  const head=$('tableHead'),body=$('tableBody');
  if(!head||!body)return;
  const headRow=document.createElement('tr');
  for(const [key,label] of columns){
    const th=document.createElement('th');
    const button=document.createElement('button');button.type='button';
    const active=key===sortKey;button.textContent=label;
    button.setAttribute('aria-label','Sort by '+label);
    if(active){
      th.setAttribute('aria-sort',sortAsc?'ascending':'descending');
      const arrow=document.createElement('span');arrow.className='arrow';
      arrow.textContent=sortAsc?' ▲':' ▼';arrow.setAttribute('aria-hidden','true');button.append(arrow);
    }
    button.addEventListener('click',()=>{
      if(sortKey===key)sortAsc=!sortAsc;
      else{sortKey=key;sortAsc=['team','name','rank','leagueRank','powerRank','averageLeagueRank','averagePowerRank','age','division'].includes(key);}
      drawTable();
    });th.append(button);headRow.append(th);
  }
  head.replaceChildren(headRow);
  const fragment=document.createDocumentFragment();
  for(const row of sortRows(activeRows)){
    const tr=document.createElement('tr');
    for(const [key] of columns)cell(tr,row,key);
    fragment.append(tr);
  }
  if(!activeRows.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=columns.length;td.className='empty';td.textContent='No included verified teams match these filters.';
    tr.append(td);fragment.append(tr);
  }
  body.replaceChildren(fragment);
  $('rowCount').textContent=activeRows.length+' '+(profile?'verified teams':'clubs')+' shown · additional columns available by horizontal scrolling';
}
function notice(message){
  const el=$('coverageNotice');el.hidden=false;el.textContent=message;
}
function stat(label,value){
  const box=document.createElement('div');box.className='stat';
  const small=document.createElement('small'),strong=document.createElement('strong');
  small.textContent=label;strong.textContent=String(value);box.append(small,strong);return box;
}
function fillOptions(select,values){
  for(const value of [...new Set(values)].sort()){
    const opt=document.createElement('option');opt.value=value;opt.textContent=value;select.append(opt);
  }
}
function renderProfile(){
  const slug=query.get('club');
  const club=dataset.clubs.find(c=>c.slug===slug);
  if(!club)throw new Error('Unknown club. Choose a club from Club Rankings.');
  document.title=club.name+' · PuckLadder club profile';
  $('clubHeading').textContent=club.name;
  $('clubSubheading').textContent=club.includedTeams+' teams included from PuckLadder verified division data · All team assignments reconciled.';
  const t=club.totals;
  const stats=[
    ['Teams',club.includedTeams],
    ['Games played',t.gp],['W–L–T',record(t)],['GF / GA',goals(t)],
    ['Standings points',t.pts],['Club Win %',pct(club.winPct)],
    ['Avg League Rank',fmt(club.averageLeagueRank,2)],
    ['Avg Power Rank',fmt(club.averagePowerRank,2)],
    ['Avg Power Rating',fmt(club.averagePowerRating,2)],
    ['Avg Momentum',fmt(club.averageMomentum,2)],
    ['Avg Divisional Percentile',pct(club.averagePercentile)],
  ];
  $('clubContent').replaceChildren(...stats.map(([name,value])=>stat(name,value)));
  fillOptions($('ageFilter'),club.teams.map(t=>t.age));
  fillOptions($('divisionFilter'),club.teams.map(t=>t.division));
  const apply=()=>{
    activeRows=club.teams.filter(t=>
      (!$('ageFilter').value||t.age===$('ageFilter').value)&&
      (!$('divisionFilter').value||t.division===$('divisionFilter').value));
    drawTable();
  };
  $('ageFilter').addEventListener('change',apply);
  $('divisionFilter').addEventListener('change',apply);
  apply();
}
async function init(){
  try{
    const response=await fetch('./data/clubs.json',{cache:'no-cache'});
    if(!response.ok)throw new Error('Club data unavailable (HTTP '+response.status+')');
    dataset=await response.json();
    if(dataset.season!=='2026–27'||!Array.isArray(dataset.clubs)||
       !Number.isInteger(dataset.verifiedDivisions)||dataset.verifiedDivisions<1)
      throw new Error('Club data failed verification');
    if(dataset.coverageAudit?.mappedTeams!==dataset.includedTeams ||
       !dataset.coverageAudit?.allTeamAssignmentsUnique ||
       !dataset.coverageAudit?.allClubAggregatesReconciled ||
       dataset.clubs.some(c=>c.coverage!=='complete'||!c.coverageComplete||!c.includedTeams))
      throw new Error('Club assignment validation failed; rankings withheld.');
    if(dataset.missingDivisions?.length){
      notice('Rankings cover '+dataset.verifiedDivisions+' of '+dataset.divisionCount+
             ' verified divisions. Unavailable divisions: '+dataset.missingDivisions.join(', ')+'.');
    }
    const collected=dataset.latestVerifiedCollectionUtc?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',dateStyle:'medium',timeStyle:'short'}).format(new Date(dataset.latestVerifiedCollectionUtc)):'unavailable';
    $('verifiedAt').textContent='Latest verified collection (Toronto): '+collected+' · Games checked through '+(dataset.latestGamesThrough||'unavailable')+
      ' · '+dataset.verifiedDivisions+' of '+dataset.divisionCount+
      ' divisions · '+dataset.includedTeams+' mapped verified teams · '+dataset.clubs.length+' clubs.';
    if(profile)renderProfile();
    else{
      activeRows=dataset.clubs;drawTable();
        }
  }catch(error){
    notice(error.message);
    $('tableBody').replaceChildren();
    $('rowCount').textContent='No club rankings published until verified data is available.';
    $('verifiedAt').textContent='Club update could not be verified.';
  }
}
init();
