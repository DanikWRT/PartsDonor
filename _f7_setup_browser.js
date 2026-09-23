(async () => {
  const B = 'http://127.0.0.1:5173/api';
  const suf = Math.random().toString(36).slice(2, 8);
  const email = 'sell-ab-' + suf + '@example.com';
  const reg = await fetch(B + '/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password:'secret1', role:'seller', company_name:'ABShop ' + suf})});
  const rj = await reg.json();
  const lid = rj.company_id;
  const log = await fetch(B + '/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password:'secret1'})});
  const lj = await log.json();
  const token = lj.access_token;
  localStorage.setItem('pd-token', token);
  const cr = await fetch(B + '/listings', {method:'POST', headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + token}, body: JSON.stringify({seller_id: lid, inventree_part_id: 1, title:'AB UI Display ' + suf, price_rub: 7999, condition:'untested', provenance:'donor', status:'active'})});
  const cj = await cr.json();
  return 'reg=' + reg.status + ' lid=' + lid + ' login=' + log.status + ' token=' + (!!token) + ' createListing=' + cr.status + ' listingId=' + (cj && cj.id) + ' status=' + (cj && cj.status) + ' hasToken=' + (!!localStorage.getItem('pd-token'));
})()
