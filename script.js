'use strict';
// 가격, 서비스 이름과 설명은 이 데이터에서 변경할 수 있습니다.
const SERVICES = {
  daily: { name: '일상 쓱싹', price: 39000, hours: 2, description: '바닥 청소, 먼지 제거, 주방·욕실 기본 청소' },
  organize: { name: '정리 쓱싹', price: 69000, hours: 3, description: '의류와 생활용품 분류, 정리수납, 수납 동선 정리' },
  deep: { name: '집중 쓱싹', price: 99000, hours: 4, description: '주방 기름때, 욕실 물때와 찌든 때 집중 청소' }
};
const SIZES = { small: { name: '10평 이하', price: 0 }, medium: { name: '11~20평', price: 20000 }, large: { name: '21~30평', price: 40000 } };
const EXTRAS = { fridge: { name: '냉장고 내부 청소', price: 15000 }, window: { name: '실내 창틀 청소', price: 10000 } };
const HOURLY_RATE = 19500;
const MICRO = {
  bathroom: { name: '화장실 청소', price: 19000, unit: '개' },
  kitchen: { name: '주방 청소', price: 19000, unit: '개' },
  laundry: { name: '빨래 케어', price: 12000, unit: '회' }
};
const STORAGE_KEY = 'ssukssak-orders-v1';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const orderDialog = $('#order-dialog');
const historyDialog = $('#history-dialog');
const form = $('#order-form');
let step = 1;
let lastOrder = null;
let toastTimer;
let submitting = false;
const money = (amount) => `${amount.toLocaleString('ko-KR')}원`;
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function dayString(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function minimumDate() { const date = new Date(); date.setDate(date.getDate() + 1); return dayString(date); }
function readOrders() {
  // 오래되었거나 수정된 브라우저 저장 데이터는 정상 주문으로 처리하지 않습니다.
  const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (!Array.isArray(parsed)) throw new Error('Invalid orders');
  return parsed.filter(order => {
    if (!order || typeof order.id !== 'string' || !Number.isFinite(order.total) || order.total < 0 || !['saved','canceled'].includes(order.status) || !['date','time','customer','phone','address','detail','request'].every(key => typeof order[key] === 'string')) return false;
    const mode = order.mode || 'package'; // 이전에 저장한 패키지 주문도 유지합니다.
    if (!Array.isArray(order.extras) || !order.extras.every(key => Object.hasOwn(EXTRAS,key))) return false;
    if (mode === 'package') return Object.hasOwn(SERVICES,order.service) && Object.hasOwn(SIZES,order.size);
    if (mode === 'hourly') return Number.isInteger(order.hours) && order.hours >= 1 && order.hours <= 6;
    if (mode === 'micro') return Array.isArray(order.micro) && order.micro.length > 0 && new Set(order.micro.map(item => item.key)).size === order.micro.length && order.micro.every(item => Object.hasOwn(MICRO,item.key) && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 3);
    return false;
  });
}
function saveOrders(orders) { localStorage.setItem(STORAGE_KEY, JSON.stringify(orders)); }
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }
function selection() {
  const data = new FormData(form);
  const mode = data.get('mode') || 'hourly';
  const service = data.get('service') || 'daily';
  const size = data.get('size') || 'small';
  const hours = Number(data.get('hours'));
  const micro = Object.keys(MICRO).map(key => ({ key, quantity: Number(data.get('micro-'+key) || 0) })).filter(item => item.quantity !== 0);
  const extras = mode === 'micro' ? [] : data.getAll('extra');
  let total = 0;
  if (mode === 'hourly') total = hours * HOURLY_RATE;
  else if (mode === 'micro') total = micro.reduce((sum,item) => sum + MICRO[item.key].price * item.quantity,0);
  else total = SERVICES[service].price + SIZES[size].price;
  total += extras.reduce((sum,key) => sum + EXTRAS[key].price,0);
  return { mode, service, size, hours: mode === 'hourly' ? hours : null, micro: mode === 'micro' ? micro : [], extras, total, date: data.get('date'), time: data.get('time'), customer: data.get('customer').trim(), phone: data.get('phone').trim(), address: data.get('address').trim(), detail: data.get('detail').trim(), request: data.get('request').trim() };
}
function updatePrice() {
  const mode = form.elements.mode.value;
  $('#hourly-options').hidden = mode !== 'hourly';
  $('#micro-options').hidden = mode !== 'micro';
  $('#package-options').hidden = mode !== 'package';
  $('#extra-options').hidden = mode === 'micro';
  // 숨겨진 수량 필드의 유효성 검사는 해당 주문 방식에서만 적용합니다.
  $$('#micro-options input').forEach(input => { input.disabled = mode !== 'micro'; });
  const order = selection();
  $('#total-price').textContent = Number.isFinite(order.total) && order.total >= 0 ? money(order.total) : '수량 확인';
  $('#service-description').textContent = SERVICES[order.service].description;
  $('#form-error').textContent = '';
}
function validateSelection() {
  const order = selection();
  let message = '';
  if (order.mode === 'hourly' && (!Number.isInteger(order.hours) || order.hours < 1 || order.hours > 6)) message = '청소 시간은 1~6시간 중에서 선택해 주세요.';
  else if (order.mode === 'micro' && !order.micro.length) message = '마이크로 집안일을 한 가지 이상 선택해 주세요.';
  else if (order.mode === 'micro' && order.micro.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 3)) message = '각 작업의 수량은 0~3 사이의 정수로 입력해 주세요.';
  else if (!['hourly','micro','package'].includes(order.mode) || !Number.isFinite(order.total) || order.total <= 0) message = '주문할 서비스를 확인해 주세요.';
  $('#form-error').textContent = message;
  return !message;
}
function orderTitle(order) {
  if (order.mode === 'hourly') return '시간 쓱싹';
  if (order.mode === 'micro') return '마이크로 쓱싹';
  return SERVICES[order.service].name;
}
function orderDetail(order) {
  if (order.mode === 'hourly') return order.hours + '시간';
  if (order.mode === 'micro') return order.micro.map(item => MICRO[item.key].name + ' ' + item.quantity + MICRO[item.key].unit).join(' · ');
  return SIZES[order.size].name;
}
function serviceRows(order) {
  if (order.mode === 'hourly') return [['주문 방식','시간 단위'], ['서비스','시간 쓱싹 · ' + order.hours + '시간'], ['시간 요금',money(HOURLY_RATE) + ' × ' + order.hours + '시간'], ['추가 케어',order.extras.map(key => EXTRAS[key].name).join(', ') || '없음']];
  if (order.mode === 'micro') return [['주문 방식','마이크로 단위'], ...order.micro.map(item => [MICRO[item.key].name,item.quantity + MICRO[item.key].unit + ' · ' + money(MICRO[item.key].price * item.quantity)])];
  return [['주문 방식','추천 패키지'], ['서비스',SERVICES[order.service].name + ' · ' + SERVICES[order.service].hours + '시간 기준'], ['공간 크기',SIZES[order.size].name], ['추가 케어',order.extras.map(key => EXTRAS[key].name).join(', ') || '없음']];
}
function reviewHTML(order, full = true) {
  const rows = [...serviceRows(order), ['희망 방문',order.date + ' · ' + order.time]];
  if (full) rows.push(['이름 / 연락처',order.customer + ' / ' + order.phone], ['방문 주소',order.address + ' ' + order.detail], ['요청사항',order.request || '없음']);
  rows.push(['예상 금액',money(order.total) + ' (예시 가격)']);
  return rows.map(([key,value]) => '<div class="review-row"><span>' + escapeHTML(key) + '</span><strong>' + escapeHTML(value) + '</strong></div>').join('');
}
function goToStep(next) {
  step = next;
  $$('[data-step]').forEach(field => {
    const active = Number(field.dataset.step) === step;
    field.hidden = !active;
    // 숨긴 필드의 기본 브라우저 유효성 검사가 제출을 방해하지 않도록 설정합니다.
    field.querySelectorAll('[required], [data-required]').forEach(input => { input.dataset.required = 'true'; input.required = active; });
  });
  $$('.form-progress li').forEach((li, index) => { li.classList.toggle('active', index + 1 <= step); if (index+1 === step) li.setAttribute('aria-current','step'); else li.removeAttribute('aria-current'); });
  $('#prev-step').hidden = step === 1;
  $('#next-step').textContent = ['방문 정보 입력하기 →', '주문 내용 확인하기 →', '체험 주문서 저장하기 ✓'][step-1];
  $('#form-error').textContent = '';
  if (step === 3) $('#order-review').innerHTML = reviewHTML(selection());
  orderDialog.scrollTop = 0;
}
function openOrder(service = 'hourly') {
  if (historyDialog.open) historyDialog.close();
  form.reset();
  form.elements.mode.value = service === 'micro' ? 'micro' : Object.hasOwn(SERVICES,service) ? 'package' : 'hourly';
  $('#service').value = Object.hasOwn(SERVICES,service) ? service : 'daily';
  const dateInput = $('#visit-date');
  dateInput.min = minimumDate();
  dateInput.value = dateInput.min;
  $('#order-flow').hidden = false;
  $('#order-success').hidden = true;
  goToStep(1); updatePrice();
  if (!orderDialog.open) orderDialog.showModal();
}
function validateVisit() {
  // 각 단계가 바뀐 뒤에도 저장 직전에 날짜와 필수 입력을 다시 검증합니다.
  const order = selection();
  if (!order.date || order.date < minimumDate()) { $('#form-error').textContent = '희망 날짜는 내일부터 선택할 수 있어요.'; return false; }
  if (!['09:00','11:00','13:00','15:00'].includes(order.time) || !order.customer || !/^01[016789]-?\d{3,4}-?\d{4}$/.test(order.phone) || order.address.length < 5) { $('#form-error').textContent = '이름, 휴대폰 번호, 방문 주소와 시간을 확인해 주세요.'; return false; }
  return true;
}
form.addEventListener('change', updatePrice);
form.addEventListener('input', event => { if (event.target.closest('#micro-options')) updatePrice(); });
$('#prev-step').addEventListener('click', () => goToStep(step-1));
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!validateSelection()) return;
  if (step === 1) { goToStep(2); return; }
  if (!validateVisit()) return;
  if (step === 2) { goToStep(3); return; }
  if (!$('#consent').checked || submitting) return;
  submitting = true; $('#next-step').disabled = true;
  try {
    const order = { ...selection(), id: `SS-${dayString(new Date()).replaceAll('-','')}-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID().slice(0,8).toUpperCase() : Math.random().toString(36).slice(2,10).toUpperCase()}`, status: 'saved', createdAt: new Date().toISOString() };
    const orders = readOrders(); orders.unshift(order); saveOrders(orders);
    lastOrder = order;
    $('#success-details').innerHTML = `<div class="review-row"><span>주문 번호</span><strong>${escapeHTML(order.id)}</strong></div>${reviewHTML(order, false)}`;
    $('#order-flow').hidden = true; $('#order-success').hidden = false; orderDialog.scrollTop = 0;
    $('#success-history').focus();
  } catch (error) {
    $('#form-error').textContent = '브라우저 저장소에 주문을 저장할 수 없어요. 저장 공간과 브라우저 설정을 확인해 주세요. 주문은 저장되지 않았습니다.';
  } finally { submitting = false; $('#next-step').disabled = false; }
});
function renderHistory() {
  let orders;
  try { orders = readOrders(); } catch { $('#history-list').innerHTML = '<p class="field-help">저장된 주문을 읽을 수 없어요. 브라우저 저장소 설정을 확인해 주세요.</p>'; return; }
  if (!orders.length) {
    $('#history-list').innerHTML = '<div class="empty-state"><span>✧</span><h3>아직 쓱싹 주문이 없어요</h3><p>우리 집에 필요한 서비스를 고르고<br>첫 번째 주문서를 만들어보세요.</p><button class="btn btn-dark" data-book>첫 쓱싹 주문하기 ↗</button></div>'; return;
  }
  $('#history-list').innerHTML = orders.map(order => `<article class="history-card"><div class="history-card-top"><span>${escapeHTML(order.id)}</span><span class="status ${order.status === 'canceled' ? 'canceled' : ''}">${order.status === 'canceled' ? '취소됨' : '체험 저장'}</span></div><h3>${escapeHTML(orderTitle(order))} <small>· ${escapeHTML(orderDetail(order))}</small></h3><p>${escapeHTML(order.date)} · ${escapeHTML(order.time)}<br>${escapeHTML(order.address)} ${escapeHTML(order.detail)}</p><p class="history-price">${money(order.total)}</p><div class="history-buttons"><button data-download="${escapeHTML(order.id)}">주문서 내려받기 ↓</button>${order.status !== 'canceled' ? `<button class="cancel-order" data-cancel="${escapeHTML(order.id)}">주문 취소</button>` : '<span class="field-help">취소된 체험 주문입니다.</span>'}</div><div class="cancel-confirm" data-confirm-box="${escapeHTML(order.id)}" hidden>저장된 주문을 취소할까요? 내역은 남아 있어요.<div class="history-buttons"><button data-confirm-cancel="${escapeHTML(order.id)}">네, 취소할게요</button><button data-keep="${escapeHTML(order.id)}">돌아가기</button></div></div></article>`).join('');
}
function openHistory() { if (orderDialog.open) orderDialog.close(); renderHistory(); if (!historyDialog.open) historyDialog.showModal(); }
function downloadOrder(order) {
  const text = [ '쓱싹의민족 체험 주문서', '※ 실제 예약·결제가 없는 체험용 주문입니다.', '', `주문 번호: ${order.id}`, `상태: ${order.status === 'canceled' ? '취소됨' : '체험 저장'}`, ...serviceRows(order).map(([label,value]) => label + ': ' + value), `희망 방문: ${order.date} ${order.time}`, `이름: ${order.customer}`, `연락처: ${order.phone}`, `주소: ${order.address} ${order.detail}`, `요청사항: ${order.request || '없음'}`, `예상 금액: ${money(order.total)} (예시 가격)`, '', '주문 내용은 외부로 전송되지 않았습니다.' ].join('\n');
  const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `쓱싹의민족-${order.id}.txt`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('click', event => {
  const book = event.target.closest('[data-book]');
  if (book) { openOrder(book.dataset.book); return; }
  const close = event.target.closest('[data-close]');
  if (close) document.getElementById(close.dataset.close).close();
  if (event.target.closest('[data-history]')) openHistory();
});
historyDialog.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  const id = button.dataset.download || button.dataset.cancel || button.dataset.confirmCancel || button.dataset.keep;
  if (!id) return;
  try {
    const orders = readOrders(); const order = orders.find(item => item.id === id); if (!order) { renderHistory(); return; }
    if (button.dataset.download) { downloadOrder(order); return; }
    const box = [...historyDialog.querySelectorAll('[data-confirm-box]')].find(item => item.dataset.confirmBox === id);
    if (button.dataset.cancel) { box.hidden = false; return; }
    if (button.dataset.keep) { box.hidden = true; return; }
    if (button.dataset.confirmCancel) { order.status = 'canceled'; saveOrders(orders); renderHistory(); toast('체험 주문을 취소했어요.'); }
  } catch { toast('주문을 변경할 수 없어요. 브라우저 저장소를 확인해 주세요.'); }
});
$('#success-history').addEventListener('click', openHistory);
$('#download-receipt').addEventListener('click', () => { if (lastOrder) downloadOrder(lastOrder); });
$('#dialog-brand').addEventListener('click', event => { event.preventDefault(); orderDialog.close(); });
[orderDialog, historyDialog].forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}));
$('#year').textContent = new Date().getFullYear();
updatePrice();

// 각 소개 장면은 화면 한 장으로 표시하고, 내용이 큰 경우 화면에 맞춰 조정합니다.
const scenes = $$('.screen');
let currentScene = 0;
function fitScenes() {
  scenes.forEach(scene => {
    const frame = scene.querySelector('.scene-frame');
    const content = scene.querySelector('.scene-content');
    const scale = Math.min(1, frame.clientHeight / Math.max(content.offsetHeight,1), frame.clientWidth / Math.max(content.scrollWidth,1));
    content.style.setProperty('--scene-scale', scale);
  });
}
function setScene(index) {
  currentScene = index;
  $('#scene-count').textContent = String(index + 1).padStart(2,'0') + ' / ' + String(scenes.length).padStart(2,'0');
  $('#previous-scene').disabled = index === 0;
  $('#next-scene').disabled = index === scenes.length - 1;
  document.body.dataset.scene = scenes[index].id;
  $$('.section-nav a').forEach(link => {
    const active = link.getAttribute('href') === '#' + scenes[index].id;
    link.classList.toggle('current',active);
    if (active) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current');
  });
}
function moveScene(delta) {
  const index = Math.max(0, Math.min(scenes.length-1, currentScene+delta));
  scenes[index].scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start' });
}
$('#previous-scene').addEventListener('click',()=>moveScene(-1));
$('#next-scene').addEventListener('click',()=>moveScene(1));
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting)setScene(scenes.indexOf(entry.target));});
  },{threshold:.55});
  scenes.forEach(scene=>observer.observe(scene));
}
if ('ResizeObserver' in window) {
  const resizer = new ResizeObserver(fitScenes);
  $$('.scene-frame, .scene-content').forEach(element=>resizer.observe(element));
}
window.addEventListener('resize',fitScenes);
document.fonts.ready.then(fitScenes);
$$('.screen img').forEach(image=>image.addEventListener('load',fitScenes));
$$('.faq-list details').forEach(details=>details.addEventListener('toggle',()=>{
  if(details.open) $$('.faq-list details').forEach(other=>{if(other!==details)other.open=false;});
  fitScenes();
}));
setScene(0);
fitScenes();
