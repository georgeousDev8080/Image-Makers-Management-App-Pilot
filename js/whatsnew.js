// =====================================================================
//  «Τι νέο υπάρχει» — εμφανίζεται μία φορά στους διαχειριστές μετά από
//  κάθε ενημέρωση. Για νέα έκδοση: προσθέστε μια εγγραφή στην αρχή του RELEASES.
// =====================================================================
import { L, esc, icon, sheet } from './core.js';
import { S, isAdmin } from './data.js';
import { pageHead } from './layout.js';

export const RELEASES = [
  {
    v: '1.7.5', date: '02/11/2026',
    items: [
      ['👥', 'Βάπτιση: στο βήμα «Συνεργείο» δεν υπάρχει πλέον επιλογή μονού / διπλού συνεργείου· η βάπτιση έχει πάντα 1 συνεργείο.', 'Baptism: the “Crew” step no longer offers single / double crew; a baptism always has 1 crew.'],
      ['🚁', 'Συνεργείο: το Drone έγινε κουμπί «+ Drone» δίπλα σε Φωτο / Βίντεο, ώστε κάποιος να κάνει π.χ. Βίντεο + Drone.', 'Crew: Drone is now a “+ Drone” button next to Photo / Video, so someone can do e.g. Video + Drone.'],
      ['⛪', 'Νέα βάπτιση: αφαιρέθηκε το πεδίο «Χώρος δεξίωσης».', 'New baptism: the “Reception venue” field was removed.'],
      ['🚫', 'Δήλωση απουσίας: αφαιρέθηκε η λίστα «Επόμενες απουσίες» από τη φόρμα (οι απουσίες φαίνονται στο ημερολόγιο).', 'Declare absence: the “Upcoming absences” list was removed from the form (absences show in the calendar).'],
      ['🔽', 'Προσφορές / Ραντεβού: τα φίλτρα μαζεύτηκαν σε ένα dropdown δίπλα στην αναζήτηση.', 'Offers / Appointments: the filters are now one dropdown next to the search.'],
    ],
  },
  {
    v: '1.7.4', date: '02/11/2026',
    items: [
      ['🔎', 'Χάρτης (pin): νέα αναζήτηση. Γράψτε εκκλησία, κτήμα, διεύθυνση ή χωριό και διαλέξτε από τα αποτελέσματα· το pin μπαίνει μόνο του και μπορείτε να το σύρετε για διόρθωση. Αν έχετε ήδη γράψει την τοποθεσία στην εκδήλωση, η αναζήτηση γίνεται αυτόματα. Δέχεται και συντεταγμένες ή σύνδεσμο Google Maps.', 'Map (pin): new search. Type a church, venue, address or village and pick from the results; the pin is placed automatically and can be dragged to adjust. If the event already has the location typed, the search runs automatically. Coordinates or a Google Maps link also work.'],
    ],
  },
  {
    v: '1.7.2', date: '02/11/2026',
    items: [
      ['👥', 'Ημερολόγιο → «+» → «Meeting»: ημερομηνία, ώρα, τοποθεσία, ποιους αφορά (με γρήγορες επιλογές «Όλοι», «Διαχειριστές», «Φωτογράφοι», «Βιντεογράφοι») και λόγοι. Οι έτοιμοι λόγοι προστίθενται, αλλάζουν ή αφαιρούνται από το «Επεξεργασία λόγων».', 'Calendar → “+” → “Meeting”: date, time, place, who it concerns (with quick picks “Everyone”, “Admins”, “Photographers”, “Videographers”) and reasons. The ready reasons can be added, edited or removed via “Edit reasons”.'],
      ['🔔', 'Μόλις δημιουργηθεί ένα meeting, όσοι το αφορά παίρνουν ειδοποίηση· το ίδιο όταν αλλάξει ή ακυρωθεί. Το meeting εμφανίζεται στο ημερολόγιο και στην Αρχική τους.', 'Once a meeting is created, everyone it concerns is notified; the same when it changes or is cancelled. It shows in their calendar and on Home.'],
    ],
  },
  {
    v: '1.7.1', date: '02/11/2026',
    items: [
      ['📌', 'Ημερολόγιο → «+» → «Άλλο»: ελεύθερη καταχώρηση στο ημερολόγιο. Υποχρεωτικός μόνο ο τίτλος· προαιρετικά ώρα, τοποθεσία και σημειώσεις. Μπορεί να το βλέπει όλη η ομάδα ή μόνο οι διαχειριστές.', 'Calendar → “+” → “Other”: a free calendar entry. Only the title is required; time, location and notes are optional. It can be visible to the whole team or to admins only.'],
    ],
  },
  {
    v: '1.7', date: '02/11/2026',
    items: [
      ['➕', 'Ημερολόγιο: το κουμπί «Νέα εκδήλωση» έγινε ένα μεγάλο «+». Πατώντας το ανοίγει μενού με «Νέα εκδήλωση», «Προγραμματισμός ραντεβού», «Next day» και «Ευχολόγιο».', 'Calendar: the “New event” button is now a big “+”. Tapping it opens a menu with “New event”, “Schedule appointment”, “Next day” and “Blessing”.'],
      ['🟡', 'Προγραμματισμός ραντεβού: τύπος εκδήλωσης, ονοματεπώνυμο, ημερομηνία & ώρα ραντεβού, τηλέφωνο και πότε είναι η εκδήλωση. Εμφανίζεται κίτρινο στο «Παρουσίαση στο μαγαζί» («Ραντεβού για Γάμο αναμένεται στις: …») και στο ημερολόγιο («Ραντεβού για Γάμο 18:30»). Την ημέρα του ραντεβού βγαίνει πρώτο (και στην Αρχική) και με ένα πάτημα ξεκινά η παρουσίαση στο μαγαζί κανονικά.', 'Schedule appointment: event type, full name, appointment date & time, phone and when the event is. Shows in yellow under “In-store presentation” and in the calendar. On the day it comes first (also on Home) and one tap starts the in-store presentation as usual.'],
      ['🌅', 'Next day και Ευχολόγιο: διαλέγετε από ποια εκδήλωση είναι και την ημερομηνία (υποχρεωτικά)· ώρα και τοποθεσία προαιρετικά. Πελάτης και συνεργείο παίρνονται από την εκδήλωση, το συνεργείο ειδοποιείται και εμφανίζονται στο ημερολόγιο, στην Αρχική και μέσα στην καρτέλα της εκδήλωσης.', 'Next day and Blessing: choose which event it belongs to and the date (required); time and location are optional. Client and crew come from the event, the crew is notified, and they show in the calendar, on Home and inside the event card.'],
    ],
  },
  {
    v: '1.6.3', date: '02/11/2026',
    items: [
      ['🏠', 'Αρχική · «Οι επόμενες εκδηλώσεις μου»: σε έμφαση πλέον ο τύπος της εκδήλωσης, η τοποθεσία και η ώρα· το όνομα του πελάτη και τα υπόλοιπα ακολουθούν από κάτω.', 'Home · “My upcoming events”: the event type, location and time are now emphasised; the client name and the rest follow below.'],
    ],
  },
  {
    v: '1.6.2', date: '02/11/2026',
    items: [
      ['🚫', 'Οι απουσίες πολλών ημερών εμφανίζονται πλέον καθαρά στο ημερολόγιο ως συμπαγής μπάρα από την πρώτη έως την τελευταία ημέρα, όπως στο Google Calendar, με το όνομα και τη σημείωση (και στο κινητό).', 'Multi-day absences now show clearly in the calendar as one solid bar from the first to the last day, like in Google Calendar, with the name and note (on mobile too).'],
    ],
  },
  {
    v: '1.6.1', date: '02/11/2026',
    items: [
      ['🗓️', 'Ημερολόγιο: νέα προβολή «Χρόνος» με όλους τους μήνες της χρονιάς· οι ημέρες με εκδηλώσεις είναι χρωματισμένες και πατώντας μια ημέρα ή έναν μήνα ανοίγει.', 'Calendar: new “Year” view with all the months; days with events are coloured and tapping a day or month opens it.'],
      ['📏', 'Οι πολυήμερες εκδηλώσεις και απουσίες εμφανίζονται όπως στο Google Calendar: μία μπάρα που απλώνεται σε όλες τις ημέρες (Μήνας και Εβδομάδα).', 'Multi-day events and absences show like in Google Calendar: one bar spanning all their days (Month and Week).'],
    ],
  },
  {
    v: '1.6', date: '02/11/2026',
    items: [
      ['📆', 'Πολυήμερες εκδηλώσεις: στη δημιουργία εκδήλωσης ενεργοποιήστε «Πολυήμερη εκδήλωση» και βάλτε την τελευταία ημέρα. Η εκδήλωση εμφανίζεται σε όλες τις ημέρες της στο ημερολόγιο (με 1/3, 2/3 …), στις λίστες, στο Excel (στήλη «Έως»), στο «Στο κινητό» και στους ελέγχους διαθεσιμότητας.', 'Multi-day events: turn on “Multi-day event” when creating an event and set the last day. It shows on all its days in the calendar (1/3, 2/3 …), in lists, in the Excel (“Until” column), in “To phone” and in availability checks.'],
      ['🧑‍🤝‍🧑', 'Επιλογή συνεργείου: όποιος είναι ήδη δεσμευμένος σε άλλη εκδήλωση τις ίδιες ημέρες φαίνεται με πορτοκαλί, με τον τύπο και την ώρα της άλλης εκδήλωσης.', 'Crew selection: anyone already booked on another event the same days is shown in orange, with that event’s type and time.'],
      ['🔔', 'Ειδοποιήσεις ανάθεσης: η πρώτη γραμμή γράφει τύπο εκδήλωσης, τοποθεσία και ώρα, και μετά όλα τα υπόλοιπα.', 'Assignment notifications: the first line shows the event type, location and time, then everything else.'],
      ['🚫', 'Απουσίες πολλών ημερών εμφανίζονται και διαγράφονται ως μία απουσία (π.χ. «3 ημέρες»).', 'Multi-day absences are shown and deleted as one absence (e.g. “3 days”).'],
    ],
  },
  {
    v: '1.5.3', date: '01/11/2026',
    items: [
      ['⏰', 'Ώρα εκδήλωσης: δίπλα στο πεδίο της ώρας υπάρχει η επιλογή «Δεν γνωρίζουμε ακόμη». Ισχύει και για τις υπάρχουσες εκδηλώσεις (Επεξεργασία).', 'Event time: next to the time field there is a “Not known yet” option. It also works for existing events (Edit).'],
      ['🔔', 'Αν μια εκδήλωση δεν έχει ακόμη ώρα 3 μήνες πριν, οι διαχειριστές λαμβάνουν ειδοποίηση για να τη συμπληρώσουν.', 'If an event still has no time 3 months before, admins get a notification to fill it in.'],
    ],
  },
  {
    v: '1.5.1', date: '01/11/2026',
    items: [
      ['🎯', 'Νέα εκδήλωση: επιλογή κάλυψης «Φωτογραφία & βίντεο», «Μόνο φωτογραφία» ή «Μόνο βίντεο». Αλλάζει και από το μεγάλο Excel (στήλη «Κάλυψη»).', 'New event: choose coverage “Photo & video”, “Photo only” or “Video only”. Also editable in the main Excel (“Coverage” column).'],
      ['⚙️', 'Οι εκδηλώσεις «Μόνο φωτογραφία» δεν μπαίνουν στο φύλλο Dimitris και δεν βγάζουν SOS βίντεο· οι «Μόνο βίντεο» δεν έχουν στάδια φωτογραφιών στην Κατάσταση Εργασιών. Η αρμοδιότητα του συνεργείου ακολουθεί την κάλυψη.', '“Photo only” events don’t appear in the Dimitris sheet and raise no video SOS; “Video only” events have no photo stages in Work status. Crew duties follow the coverage.'],
    ],
  },
  {
    v: '1.5', date: '01/11/2026',
    items: [
      ['👥', 'Νέα εκδήλωση: επιλογή «1 συνεργείο (βασικό)» ή «2 συνεργεία». Με 2 συνεργεία επιλέγετε τα άτομα, τα χωρίζετε σε συνεργείο 1 και 2 και ορίζετε τι αναλαμβάνει το καθένα (Σπίτι γαμπρού/νύφης, Εκκλησία, Κέντρο, Drone).', 'New event: choose “1 crew (main)” or “2 crews”. With 2 crews you pick the people, split them into crew 1 and 2 and set what each covers (Groom/bride homes, Church, Reception, Drone).'],
      ['📝', 'Κάθε μέλος του συνεργείου έχει μέσα στην εκδήλωση το δικό του κείμενο ανάθεσης, που φτιάχνεται αυτόματα και μπορεί να αλλάξει. Οι ειδοποιήσεις γράφουν σε κάθε μέλος τι αναλαμβάνει και ποιοι είναι μαζί του.', 'Each crew member has their own assignment note inside the event, generated automatically and editable. Notifications tell each member what they cover and who is with them.'],
      ['🚫', 'Δήλωση απουσίας στο Ημερολόγιο: κάθε μέλος δηλώνει τις μέρες/ώρες που δεν είναι διαθέσιμο και οι διαχειριστές μπορούν να δηλώσουν για οποιονδήποτε.', 'Absence declarations in the Calendar: each member declares days/hours they are unavailable and admins can declare for anyone.'],
      ['⛔', 'Στην επιλογή συνεργείου, όποιος δεν είναι διαθέσιμος εκείνη την ημέρα φαίνεται αλλά δεν επιλέγεται, με τις ώρες σε παρένθεση.', 'When choosing the crew, anyone unavailable that day is shown but cannot be selected, with the hours in brackets.'],
    ],
  },
  {
    v: '1.4.2', date: '31/10/2026',
    items: [
      ['🔢', 'iPhone: το PIN πληκτρολογείται γρήγορα χωρίς zoom — δύο ίδια ψηφία στη σειρά (π.χ. 11) μετράνε κανονικά ως δύο πατήματα.', 'iPhone: the PIN can be typed quickly without zooming — two identical digits in a row (e.g. 11) count as two taps.'],
      ['🔍', 'iPhone: η εφαρμογή δεν κάνει πια zoom με διπλό πάτημα ούτε όταν πατάτε σε πεδίο για να γράψετε. Το zoom με δύο δάχτυλα λειτουργεί κανονικά.', 'iPhone: the app no longer zooms on double-tap or when you tap a field to type. Two-finger zoom still works.'],
    ],
  },
  {
    v: '1.4.1', date: '31/10/2026',
    items: [
      ['🎞️', 'Φύλλο Dimitris: η «Κατάσταση Βίντεο» (όχι έτοιμο, υπό επεξεργασία, έτοιμο να γίνει export, έτοιμο) είναι πλέον ξεχωριστή στήλη και η «Κατάσταση editing» στο μεγάλο Excel κρατά τις γνωστές επιλογές.', 'Dimitris sheet: “Video status” (not ready, in progress, ready for export, ready) is now its own column and “Editing status” in the main Excel keeps its usual options.'],
      ['🚦', 'Νέα στήλη «Προτεραιότητα» στο φύλλο Dimitris, που αλλάζει μόνη της: φωτογραφίες σε «Αλλαγές» → «Να γίνει», album σε «Εκτύπωση στο εργαστήριο» → SOS. Γίνεται «Έτοιμο» (και στο μεγάλο Excel, φεύγει το SOS) μόνο όταν το βίντεο είναι «έτοιμο» και «παραδόθηκε στο μαγαζί».', 'New “Priority” column in the Dimitris sheet that updates itself: photos to “Changes” → “To do”, album to the lab → SOS. It becomes “Ready” (also in the main Excel, SOS clears) only when the video is “ready” and “delivered to the shop”.'],
    ],
  },
  {
    v: '1.4', date: '31/10/2026',
    items: [
      ['🎬', 'Το φύλλο Dimitris έγινε ίδιο με το Google Sheet του: Μήνας, Ημερομηνία, Κατηγορία, Τοποθεσία, Κατάσταση Βίντεο, Είναι στο μαγαζί;, Υπολογιστής, Περασμένα αρχεία, Αποθηκευμένο σε και Σχόλια, με χρωματιστές επιλογές.', 'The Dimitris sheet now matches his Google Sheet: Month, Date, Category, Location, Video status, In the shop?, Computer, Files copied, Stored at and Comments, with coloured options.'],
    ],
  },
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
