// =====================================================================
//  «Τι νέο υπάρχει» — εμφανίζεται μία φορά στους διαχειριστές μετά από
//  κάθε ενημέρωση. Για νέα έκδοση: προσθέστε μια εγγραφή στην αρχή του RELEASES.
// =====================================================================
import { L, esc, icon, sheet } from './core.js';
import { S, isAdmin } from './data.js';
import { pageHead } from './layout.js';

export const RELEASES = [
  {
    v: '1.3', date: '30/10/2026',
    items: [
      ['🗄️', 'Μηνιαίο αντίγραφο ασφαλείας: από την 1η κάθε μήνα εμφανίζεται οθόνη με έτοιμα τα κουμπιά αντιγράφου. Μέχρι να κατεβάσει αντίγραφο ένας διαχειριστής, κανένας διαχειριστής δεν συνεχίζει στην εφαρμογή. Ξεκινά από 1 Νοεμβρίου.', 'Monthly backup: from the 1st of every month a screen appears with the backup buttons ready. Until one admin downloads a backup, no admin can continue in the app. Starts 1 November.'],
      ['📄', 'Σελίδα εκδήλωσης: «Επεξεργασία της συγκεκριμένης προσφοράς» στο Πακέτο & προσφορά, χωρίς το ανέβασμα έτοιμου PDF.', 'Event page: “Edit this offer” under Package & offer, without the ready-PDF upload.'],
      ['🚁', 'Σελίδα εκδήλωσης: δίπλα σε κατηγορία και ανάλυση φαίνεται «Drone» όταν η εκδήλωση έχει drone.', 'Event page: “Drone” appears next to the category and resolution when the event includes a drone.'],
    ],
  },
  {
    v: '1.2.1', date: '30/10/2026',
    items: [
      ['👶', 'Ενημερωμένος Οδηγός προσφοράς βάπτισης: τα μικρά album 47×20 επιλέγονται πλέον σε όση ποσότητα χρειάζεται (+70€ το καθένα).', 'Updated baptism offer builder: small 47×20 albums can now be added in any quantity (+70€ each).'],
    ],
  },
  {
    v: '1.2', date: '30/10/2026',
    items: [
      ['👶', 'Νέος Οδηγός προσφοράς βάπτισης: στη δημιουργία εκδήλωσης βάπτισης η προσφορά γίνεται με το πακέτο βάπτισης 2027 (βασικό πακέτο, αναβαθμίσεις, album, εκτυπώσεις, τελική τιμή) και το PDF επισυνάπτεται αυτόματα.', 'New baptism offer builder: when creating a baptism event, the offer uses the 2027 baptism package (base package, upgrades, album, prints, final price) and the PDF is attached automatically.'],
      ['✅', 'Η προσφορά βάπτισης είναι υποχρεωτική για να αποθηκευτεί η εκδήλωση, όπως και στους γάμους.', 'The baptism offer is required to save the event, just like for weddings.'],
      ['📋', 'Το συνεργείο βλέπει στη βάπτιση τι περιλαμβάνει η κάλυψη (π.χ. drone, φωτογράφηση πριν), χωρίς τιμές.', 'For baptisms the crew sees what the coverage includes (e.g. drone, pre-baptism shoot), without prices.'],
    ],
  },
  {
    v: '1.1.4', date: '30/10/2026',
    items: [
      ['📄', 'Διαφημιστικό και Άλλο: η εκδήλωση δημιουργείται χωρίς PDF προσφοράς. Στο τελευταίο βήμα συμπληρώνετε μόνο την αξία και τα στοιχεία του πακέτου.', 'Promo and Other: the event is created without an offer PDF. In the last step you only fill in the value and package details.'],
    ],
  },
  {
    v: '1.1.3', date: '30/10/2026',
    items: [
      ['🏠', 'Νέα εκδήλωση: τα πεδία «Σπίτι νύφης» και «Σπίτι γαμπρού» εμφανίζονται μόνο σε Γάμο και Γαμοβάπτιση.', 'New event: “Bride’s home” and “Groom’s home” appear only for Wedding and Wedding & Baptism.'],
      ['📍', 'Διαφημιστικό και Άλλο: απλή φόρμα με «Τοποθεσία» και «Σχόλια», χωρίς εκκλησία και δεξίωση.', 'Promo and Other: a simple form with “Location” and “Comments”, without church and reception.'],
    ],
  },
  {
    v: '1.1.2', date: '30/10/2026',
    items: [
      ['📋', 'Κατάσταση Εργασιών: στο «Σε εξέλιξη» εμφανίζονται όλες οι κλεισμένες εκδηλώσεις, όποια χρονιά κι αν είναι (και του 2027), μέχρι να παραδοθούν. Η επιλογή χρονιάς εμφανίζεται στα «Παραδόθηκαν» και «Όλες».', 'Work status: “In progress” shows every booked event, whatever the year (2027 too), until delivered. The year picker appears under “Delivered” and “All”.'],
    ],
  },
  {
    v: '1.1.1', date: '30/10/2026',
    items: [
      ['📑', 'Η καρτέλα «Mitsos» μετονομάστηκε σε «Dimitris» και η σελίδα μοντάζ σε «Editing Workflow».', 'The “Mitsos” tab is now called “Dimitris” and the editing page “Editing Workflow”.'],
    ],
  },
  {
    v: '1.1', date: '30/10/2026',
    items: [
      ['🗓️', 'Νέο ημερολόγιο με προβολές Ημέρα, Εβδομάδα, Μήνας και Πρόγραμμα. Πατήστε σε κενή ώρα για να δημιουργήσετε εκδήλωση εκείνη την ώρα.', 'New calendar with Day, Week, Month and Schedule views. Tap an empty time slot to create an event at that time.'],
      ['🕕', 'Όλες οι ώρες εμφανίζονται σε 24ωρη μορφή (π.χ. 18:00).', 'All times are shown in 24-hour format (e.g. 18:00).'],
      ['🏠', 'Σπίτι νύφης και σπίτι γαμπρού είναι πλέον ξεχωριστά πεδία στην εκδήλωση.', 'Bride’s house and groom’s house are now separate fields on the event.'],
      ['📍', 'Χάρτης με pin: επιλέγετε εσείς το ακριβές σημείο για εκκλησία, σπίτια και δεξίωση, και το συνεργείο ανοίγει την πλοήγηση με ένα πάτημα.', 'Map pins: you choose the exact spot for the church, houses and reception, and the crew opens navigation with one tap.'],
      ['🚁', 'Νέα αρμοδιότητα «Drone» στην ανάθεση συνεργείου, δίπλα σε Φωτογραφία και Βίντεο.', 'New “Drone” duty in crew assignment, next to Photo and Video.'],
      ['🗑️', 'Οριστική διαγραφή εκδήλωσης και απευθείας από το φύλλο Excel.', 'Permanently delete an event directly from the Excel sheet too.'],
      ['🔔', 'Ειδοποιήσεις σε δύο καρτέλες: Μη αναγνωσμένες και Αναγνωσμένες.', 'Notifications in two tabs: Unread and Read.'],
      ['📋', 'Κατάσταση Εργασιών: κάθε εκδήλωση εμφανίζεται από τη στιγμή που κλείνεται.', 'Work status: every event appears from the moment it is booked.'],
      ['💶', 'Έσοδα & Έξοδα ανά έτος, με σύνολα για κάθε μήνα.', 'Income & Expenses by year, with totals for each month.'],
      ['➕', 'Προσθήκη δόσης από το Excel: η εκδήλωση και η κατηγορία είναι ήδη επιλεγμένες, για να μη γίνονται λάθη.', 'Adding an installment from the Excel: the event and category are already set, to avoid mistakes.'],
      ['📑', 'Dimitris: ανοίγει κατευθείαν στο δικό του φύλλο, με προεπιλογή «Όλα» και χωρίς τη στήλη Βιντεογράφος.', 'Dimitris: opens straight to its own sheet, defaulting to “All”, without the Videographer column.'],
      ['🏡', 'Αρχική: οι επόμενες εκδηλώσεις δείχνουν αν είναι μονό ή διπλό συνεργείο.', 'Home: upcoming events show whether it is a single or double crew.'],
    ],
  },
];
export const LATEST = RELEASES[0].v;
const WATERMARK = 'georgeousDev Software Solutions - gkararizosg@gmail.com';

const releaseHTML = (r) => `<div class="wn-rel">
  <div class="wn-ver"><span class="pill accent">v${esc(r.v)}</span><span class="small muted">${esc(r.date)}</span></div>
  <ul class="wn-list">${r.items.map(([e, el, en]) => `<li><span class="wn-e">${e}</span><span>${esc(L(el, en))}</span></li>`).join('')}</ul></div>`;
const watermark = () => `<div class="wn-mark">${esc(WATERMARK)}</div>`;

const key = () => 'im.wn.' + (S.profile?.id || '');
const seen = () => { try { return localStorage.getItem(key()); } catch { return LATEST; } };
const markSeen = () => { try { localStorage.setItem(key(), LATEST); } catch {} };

/** Μία φορά ανά έκδοση, μόνο για διαχειριστές (οι νέοι χρήστες βλέπουν πρώτα την περιήγηση) */
export function maybeShowWhatsNew() {
  if (!isAdmin()) return;
  let tourDone = false;
  try { tourDone = !!localStorage.getItem('im.tour.' + S.profile?.id); } catch { return; }
  if (!tourDone) { markSeen(); return; }
  if (seen() === LATEST) return;
  setTimeout(() => showWhatsNew(), 900);
}

export function showWhatsNew() {
  markSeen();
  const body = document.createElement('div');
  body.className = 'wn';
  body.innerHTML = `<div class="wn-hero"><div class="wn-big">✨</div><h2>${esc(L('Τι νέο υπάρχει', 'What’s new'))}</h2><p class="muted small">${esc(L('Η εφαρμογή ενημερώθηκε. Αυτές είναι οι αλλαγές:', 'The app was updated. Here are the changes:'))}</p></div>
    ${releaseHTML(RELEASES[0])}${watermark()}`;
  sheet({ title: L('Ενημέρωση', 'Update'), body, right: `<button class="btn plain" data-close><b>${esc(L('Εντάξει', 'OK'))}</b></button>` });
}

export function renderWhatsNew(root) {
  markSeen();
  root.innerHTML = pageHead(L('Τι νέο υπάρχει', 'What’s new'), { sub: esc(L('Οι αλλαγές σε κάθε ενημέρωση της εφαρμογής.', 'Changes in every app update.')) })
    + `<div class="wn card pad">${RELEASES.map(releaseHTML).join('<hr class="wn-sep">')}${watermark()}</div>`
    + `<div class="hstack mt"><a class="btn" href="#/home">${icon('chevL')} ${esc(L('Αρχική', 'Home'))}</a></div>`;
}
