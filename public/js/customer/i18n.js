/**
 * i18n.js — English / Hindi strings and job names + icons for the customer page.
 */

export const STRINGS = {
  en: {
    shopName:     'New Yogeshwar Electric & Nal Fitting',
    location:     'Sane Nagar, Amalner',
    devBy:        'Site developed by Mayuur, Bangalore',
    heroTitle:    'Trusted local workers, one tap away',
    heroText:     'Electricians, plumbers, painters & more — call or WhatsApp them directly.',
    search:       'Search workers by name',
    lookingFor:   'What are you looking for?',
    allJobs:      'All',
    trust1:       'Recommended by the shop',
    trust2:       'Call or WhatsApp directly',
    trust3:       'Local to Amalner',
    promoTitle:   'Not sure who to call?',
    promoText:    'Call the shop and we will connect you with a worker we trust.',
    callShop:     'Call shop',
    directions:   'Directions',
    workersTitle: 'All workers',
    clearFilter:  'Show all',
    verified:     'Recommended',
    showNumber:   'Show number',
    call:         'Call',
    whatsapp:     'WhatsApp',
    noWorkers:    'No workers found',
    noWorkersHint:'Try another category or a different name.',
    countOne:     '1 worker',
    countMany:    ' workers',
    address:      'Sane Nagar, Amalner, Maharashtra 425401',
    footerAbout:  'Your local shop for electrical and plumbing work in Amalner.',
    error:        'Something went wrong. Please try again.',
  },
  hi: {
    shopName:     'न्यू योगेश्वर इलेक्ट्रिक & नल फिटिंग',
    location:     'सानेनगर, अमळनेर',
    devBy:        'साइट डेवलपर: मयूर, बेंगलुरु',
    heroTitle:    'भरोसेमंद स्थानीय कारीगर, बस एक टैप दूर',
    heroText:     'इलेक्ट्रीशियन, प्लंबर, पेंटर और बहुत कुछ — सीधे कॉल या व्हाट्सएप करें।',
    search:       'नाम से कारीगर खोजें',
    lookingFor:   'आपको क्या चाहिए?',
    allJobs:      'सभी',
    trust1:       'दुकान द्वारा अनुशंसित',
    trust2:       'सीधे कॉल या व्हाट्सएप',
    trust3:       'अमळनेर के स्थानीय',
    promoTitle:   'समझ नहीं आ रहा किसे बुलाएं?',
    promoText:    'दुकान पर कॉल करें, हम आपको भरोसेमंद कारीगर से जोड़ देंगे।',
    callShop:     'दुकान पर कॉल करें',
    directions:   'रास्ता देखें',
    workersTitle: 'सभी कारीगर',
    clearFilter:  'सभी दिखाएं',
    verified:     'अनुशंसित',
    showNumber:   'नंबर दिखाएं',
    call:         'कॉल करें',
    whatsapp:     'व्हाट्सएप',
    noWorkers:    'कोई कारीगर नहीं मिला',
    noWorkersHint:'दूसरी श्रेणी या कोई और नाम आज़माएं।',
    countOne:     '1 कारीगर',
    countMany:    ' कारीगर',
    address:      'सानेनगर, अमळनेर, महाराष्ट्र 425401',
    footerAbout:  'अमळनेर में बिजली और नल के काम के लिए आपकी स्थानीय दुकान।',
    error:        'कुछ गलत हो गया। कृपया पुनः प्रयास करें।',
  },
};

const JOB_HI = {
  'Electrician':   'इलेक्ट्रीशियन',
  'Plumber':       'प्लंबर',
  'AC Technician': 'AC टेक्नीशियन',
  'Painter':       'पेंटर',
  'Carpenter':     'कारपेंटर',
  'Mason':         'मिस्त्री',
  'Welder':        'वेल्डर',
};

export function jobLabel(name, lang) {
  return (lang === 'hi' && JOB_HI[name]) || name;
}

// Job names come from the sheet, so match loosely; unknown jobs get a toolbox.
const JOB_ICONS = [
  [/electric|wiring|light/i, '💡'],
  [/plumb|nal|pipe|tap/i, '🚰'],
  [/\bac\b|air ?con|fridge|refrigerat|cool/i, '❄️'],
  [/paint/i, '🎨'],
  [/carpent|furniture|wood/i, '🪚'],
  [/mason|tile|construct|brick/i, '🧱'],
  [/weld|fabricat/i, '🔥'],
  [/motor|pump|borewell/i, '⚙️'],
  [/clean/i, '🧹'],
];

export function jobIcon(name) {
  const match = JOB_ICONS.find(([re]) => re.test(name));
  return match ? match[1] : '🧰';
}
