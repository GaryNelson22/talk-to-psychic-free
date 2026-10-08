document.addEventListener('DOMContentLoaded', function () {
  var dialog = document.getElementById('ttpsf-start-dialog');
  var form = document.getElementById('ttpsf-start-form');
  if (!dialog || !form || typeof dialog.showModal !== 'function') return;

  var destination = '';
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    var url = new URL(link.href);
    if (url.origin !== window.location.origin || url.pathname.replace(/\/+$/, '') !== '/go') return;
    event.preventDefault();
    destination = link.href;
    form.reset();
    dialog.showModal();
    document.getElementById('ttpsf-start-name').focus();
  });

  dialog.querySelector('[data-ttpsf-close]').addEventListener('click', function () {
    dialog.close();
  });
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) dialog.close();
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var name = document.getElementById('ttpsf-start-name');
    name.value = name.value.trim();
    if (!form.reportValidity() || !destination) return;
    window.location.assign(destination);
  });
});
