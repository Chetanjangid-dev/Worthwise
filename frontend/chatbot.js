/* ==========================================================================
   Worthwise Assistant — custom chatbot (no third-party service, no iframe)

   What it does
   - Knows the whole Worthwise project (see KNOWLEDGE below) and answers user
     questions instantly, in the browser.
   - When the user is logged in it can also answer "my ..." questions using
     their own data (financial health, profile numbers, goals) through the
     app's existing SpendWiseAPI. Nothing is sent anywhere else.
   - Understands English and Hinglish questions.
   - Optional: plug a real LLM backend in via WORTHWISE_CHATBOT_CONFIG.aiEndpoint
     (see the bottom of the file). Until then everything works offline.

   To teach the bot something new, add an entry to KNOWLEDGE.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Config (override by defining window.WORTHWISE_CHATBOT_CONFIG before
   * this script loads)
   * ------------------------------------------------------------------ */
  var CONFIG = {
    name: 'Worthwise Assistant',
    // Optional AI backend. POST { message, history, systemPrompt } -> { reply: "..." }
    // Leave empty to use only the built-in knowledge base.
    aiEndpoint: '',
    storageKey: 'worthwise_chat_v1',
    maxMessages: 60,
    greetEveryMs: 19000     // robot waves + shows a small "Hello!" bubble this often
  };
  if (root.WORTHWISE_CHATBOT_CONFIG) {
    for (var ck in root.WORTHWISE_CHATBOT_CONFIG) CONFIG[ck] = root.WORTHWISE_CHATBOT_CONFIG[ck];
  }

  /* ------------------------------------------------------------------ *
   * KNOWLEDGE BASE
   *   id    unique name
   *   k     keywords / phrases (lower-case). Multi-word phrases score higher.
   *   a     answer (supports **bold** and "- " bullet lines)
   *   hi    optional Hinglish answer (used when the user writes in Hinglish)
   *   act   optional buttons: { label, hash } | { label, demo:true }
   *   next  optional follow-up question chips
   * ------------------------------------------------------------------ */
  var KNOWLEDGE = [
    {
      id: 'greeting',
      k: ['hi', 'hello', 'hey', 'hii', 'hiii', 'namaste', 'namaskar', 'hola', 'yo', 'hey there', 'hello there', 'sup', 'hlo', 'helo', 'ram ram'],
      a: "Hi! I'm the **Worthwise Assistant**. Ask me anything about Worthwise: analyzing a purchase, goals, your financial profile, or your account.",
      hi: "Namaste! Main **Worthwise Assistant** hoon. Aap mujhse Worthwise ke baare mein kuch bhi pooch sakte hain: purchase analyze karna, goals, financial profile ya account.",
      next: ['What is Worthwise?', 'How do I analyze a purchase?', 'What do BUY, WAIT and SKIP mean?']
    },
    {
      id: 'good-morning',
      k: ['good morning', 'gm', 'morning', 'subah', 'suprabhat', 'shubh prabhat', 'gud morning', 'good mrng'],
      a: "Good morning! Hope your day starts well. Want to check a purchase before you spend today? Ask me anything about **Worthwise**.",
      hi: "Good morning! Aapka din shandaar ho. Aaj kuch kharidne se pehle check karna hai? **Worthwise** ke baare mein kuch bhi poochiye.",
      next: ['How do I analyze a purchase?', 'Show my financial health', 'What is Worthwise?']
    },
    {
      id: 'good-afternoon',
      k: ['good afternoon', 'afternoon', 'dopahar', 'shubh dopahar', 'gud afternoon'],
      a: "Good afternoon! How can I help you with **Worthwise** today?",
      hi: "Good afternoon! Aaj main **Worthwise** mein aapki kaise madad kar sakta hoon?",
      next: ['How do I analyze a purchase?', 'What do BUY, WAIT and SKIP mean?', 'What is Worthwise?']
    },
    {
      id: 'good-evening',
      k: ['good evening', 'evening', 'shaam', 'shubh sandhya', 'gud evening'],
      a: "Good evening! Planning a purchase tonight? Let me help you think it through first.",
      hi: "Good evening! Aaj raat kuch kharidne ka plan hai? Pehle ek baar soch lete hain.",
      next: ['How do I analyze a purchase?', 'Show my financial health', 'What is Worthwise?']
    },
    {
      id: 'good-night',
      k: ['good night', 'goodnight', 'gn', 'night', 'shubh ratri', 'raat', 'gud night', 'sweet dreams', 'sleep well', 'sone ja raha', 'sone ja rahi'],
      a: "Good night! Sleep well, and remember: sleep on big purchases too. Spend smarter, live better.",
      hi: "Good night! Achhi neend lijiye, aur bade purchase se pehle ek raat sochna mat bhoolna. Smart kharch karein, behtar jeeyein."
    },
    {
      id: 'creator',
      k: ['who made you', 'who made this', 'who made worthwise', 'who created you', 'who created this', 'who created worthwise', 'who built you', 'who built this', 'who built worthwise', 'who developed', 'who is your creator', 'who is your developer', 'who is your owner', 'who owns', 'your creator', 'your developer', 'your maker', 'made by', 'created by', 'developed by', 'built by', 'who is chetan', 'chetan', 'kisne banaya', 'kisne banaya hai', 'tumhe kisne banaya', 'aapko kisne banaya', 'banane wala', 'developer', 'creator', 'founder', 'owner'],
      a: "I'm the **Worthwise Assistant**, made by **Mr. Chetan**. He is also the one who built Worthwise, the purchase decision app you are using right now.",
      hi: "Main **Worthwise Assistant** hoon, aur mujhe **Mr. Chetan** ne banaya hai. Unhone hi ye Worthwise app (purchase decision engine) banaya hai.",
      next: ['What is Worthwise?', 'How does it work?', 'What can you do?']
    },
    {
      id: 'how-are-you',
      k: ['how are you', 'how r u', 'how are u', 'hows it going', "how's it going", 'whats up', "what's up", 'wassup', 'kaise ho', 'kese ho', 'kaisa hai', 'kya haal', 'kya haal hai', 'kaisi ho', 'sab theek', 'how do you do', 'how is your day'],
      a: "I'm doing great, thanks for asking! Ready to help you make smarter purchase decisions. What would you like to know?",
      hi: "Main badhiya hoon, poochne ke liye shukriya! Aapko smart purchase decision lene mein madad karne ke liye taiyaar hoon. Bataiye, kya jaanna hai?",
      next: ['What is Worthwise?', 'How do I analyze a purchase?', 'Show my financial health']
    },
    {
      id: 'name',
      k: ['what is your name', "what's your name", 'whats your name', 'tell me your name', 'your name', 'naam kya hai', 'tumhara naam', 'aapka naam', 'tera naam', 'apna naam', 'naam batao', 'name batao'],
      a: "My name is **Worthwise Assistant**. I was made by **Mr. Chetan** to help you use Worthwise.",
      hi: "Mera naam **Worthwise Assistant** hai. Mujhe **Mr. Chetan** ne banaya hai taaki main aapko Worthwise use karne mein madad kar sakoon."
    },
    {
      id: 'joke',
      k: ['joke', 'tell me a joke', 'funny', 'make me laugh', 'chutkula', 'mazak', 'hasao', 'something funny'],
      a: "Here is one: why did the wallet go to therapy? Because it had too many *impulse* issues. Ask Worthwise before you spend and your wallet stays happy.",
      hi: "Ek suno: wallet therapy mein kyun gaya? Kyunki usse bahut zyada *impulse buying* ki problem thi. Kharidne se pehle Worthwise se pooch lo, wallet khush rahega."
    },
    {
      id: 'compliment',
      k: ['you are good', "you're good", 'you are great', 'you are smart', 'you are awesome', 'good bot', 'nice bot', 'well done', 'love you', 'i love you', 'best bot', 'tum acche ho', 'tum acche ho', 'badhiya', 'mast', 'zabardast', 'shaandar', 'sahi hai'],
      a: "Thank you, that is kind of you! Mr. Chetan will be happy to hear it. Anything else I can help you with?",
      hi: "Shukriya, aapne bahut achha kaha! Mr. Chetan ko bhi ye sunke khushi hogi. Kuch aur madad chahiye?"
    },
    {
      id: 'sorry-ok',
      k: ['sorry', 'my bad', 'maaf karo', 'maafi', 'ok', 'okay', 'okk', 'hmm', 'hmmm', 'fine', 'alright', 'thik hai', 'ठीक है'],
      a: "No problem at all! Let me know if you want to know anything else about Worthwise.",
      hi: "Koi baat nahi! Worthwise ke baare mein kuch aur jaanna ho to bata dijiye."
    },
    {
      id: 'language',
      k: ['language', 'languages', 'hindi', 'english', 'hinglish', 'speak hindi', 'speak english', 'bhasha', 'hindi mein', 'hindi me', 'english mein'],
      a: "I understand **English** and **Hinglish** (Hindi written in English letters). Ask in whichever feels natural to you.",
      hi: "Main **English** aur **Hinglish** (English letters mein Hindi) samajhta hoon. Jis mein aap comfortable ho, usi mein poochiye."
    },
    {
      id: 'age-place',
      k: ['how old are you', 'your age', 'where are you from', 'where do you live', 'are you real', 'are you a robot', 'are you a human', 'tumhari umar', 'kahan se ho', 'kahan rehte ho', 'robot ho'],
      a: "I am a little robot living inside the Worthwise app, so I do not have an age or a home address. I was made by **Mr. Chetan**, and my job is to answer your Worthwise questions.",
      hi: "Main Worthwise app ke andar rehne wala ek chhota robot hoon, isliye meri koi umar ya ghar nahi hai. Mujhe **Mr. Chetan** ne banaya hai, aur mera kaam Worthwise ke sawaalon ke jawab dena hai."
    },
    {
      id: 'saving-tip',
      k: ['saving tip', 'saving tips', 'tip', 'tips', 'how to save', 'save money', 'how can i save', 'budget tip', 'spend less', 'bachat kaise', 'paise kaise bachaye', 'paise bachao', 'bachat tips'],
      a: "A few simple habits that work well with Worthwise:\n- Wait a day or two before any non-essential purchase.\n- Keep your **emergency fund** growing before big buys.\n- Keep your monthly expenses below income so your **surplus** stays positive.\n- Add a **goal** so you can see what a purchase would delay.\n\nThese are general habits, not professional financial advice.",
      hi: "Kuch aasaan aadatein jo Worthwise ke saath achhi chalti hain:\n- Zaroori na ho to kharidne se pehle ek-do din ruk jaiye.\n- Bade purchase se pehle **emergency fund** badhaiye.\n- Kharche income se kam rakhiye taaki **surplus** positive rahe.\n- Ek **goal** add kijiye taaki dikhe ki purchase se kya delay hoga.\n\nYe general aadatein hain, professional financial advice nahi.",
      next: ['How do I add a goal?', 'How is the financial health score calculated?']
    },
    {
      id: 'demo-limit',
      k: ['trial account', 'demo account limit', 'trial limit', 'demo limit', 'trial quota', 'demo quota', 'quota in trial', 'quota in demo', 'limit in trial', 'limit in demo', 'free trial', 'trial me', 'trial mein', 'demo me', 'demo mein', 'how many analyses in demo', 'how many requests in demo', 'how many requests in trial', 'how many times can i try', 'demo analyses', 'demo finished', 'demo ended', 'demo over', 'demo expired', 'trial expired', 'trial ended', 'trial over', 'after demo', 'after trial', 'after the demo', 'after the trial', 'what happens after', 'when demo ends', 'when trial ends', 'demo ke baad', 'trial ke baad', 'kitni request', 'kitne request', 'kitni baar'],
      a: "In the **demo / trial account** you can run **2 analyses** (2 requests). A small banner at the top shows how many are left, for example \"Demo mode · 1 of 2 analyses left\".\n\nOnce both are used, the demo is finished. To keep using Worthwise, **create a free account with your real email**: you will get a 6-digit verification code on that email, and your own profile, goals and decisions are then saved under your account.\n\nTip: tapping **Try Demo** again in the same browser resumes the same demo, it does not give you new analyses.",
      hi: "**Demo / trial account** mein aap **2 analyses** (2 requests) chala sakte hain. Upar ek chhota banner dikhata hai kitne bache hain, jaise \"Demo mode · 1 of 2 analyses left\".\n\nDono khatam hone ke baad demo poora ho jata hai. Worthwise aage use karne ke liye **apni asli (original) email se free account banayein**: us email par 6-digit verification code aayega, aur phir aapka profile, goals aur decisions aapke account mein save rahenge.\n\nTip: usi browser mein dobara **Try Demo** dabane par wahi purana demo khulta hai, naye analyses nahi milte.",
      act: [{ label: 'Create account', hash: '#/auth' }],
      next: ['How do I create an account?', 'What are the monthly limits?', 'What is the demo?']
    },
    {
      id: 'account-limit',
      k: ['quota after', 'limit after', 'after creating account', 'after creating an account', 'after signup', 'after sign up', 'after registering', 'after register', 'real account limit', 'real account', 'registered account', 'free account', 'full account', 'account quota', 'account limit', 'account limits', 'demo vs account', 'trial vs account', 'difference between demo and account', 'difference between trial and account', 'account banane ke baad', 'account ke baad', 'signup ke baad', 'original email', 'real email', 'asli email', 'upgrade', 'unlimited'],
      a: "With a **real account** (created with your original email):\n- **Purchase decisions** are always calculated, with **no limit**.\n- The **AI explanation** and the **live product search** (Market Research) have a **monthly limit**. The dashboard card **API Usage This Month** shows how many you have used, how many are left and the date they reset.\n- Your profile, goals and decisions are saved to your account.\n\nIn the **demo** you only get **2 analyses**, so a real account is the way to keep using Worthwise.",
      hi: "**Real account** (apni original email se banaya hua) mein:\n- **Purchase decisions** hamesha calculate hote hain, **koi limit nahi**.\n- **AI explanation** aur **live product search** (Market Research) ki **monthly limit** hoti hai. Dashboard ka **API Usage This Month** card dikhata hai kitna use hua, kitna bacha aur kab reset hoga.\n- Aapka profile, goals aur decisions aapke account mein save rehte hain.\n\n**Demo** mein sirf **2 analyses** milte hain, isliye aage use karne ke liye real account banana hoga.",
      act: [{ label: 'Create account', hash: '#/auth' }, { label: 'Open dashboard', hash: '#/dashboard' }],
      next: ['What happens after the demo?', 'What are the monthly limits?', 'How do I create an account?']
    },
    {
      id: 'delete-account',
      k: ['delete account', 'delete my account', 'delete the account', 'how to delete account', 'how to delete my account', 'remove account', 'remove my account', 'close account', 'close my account', 'deactivate', 'deactivate account', 'account delete', 'account delete kaise', 'account delete karna', 'account hatao', 'account hatana', 'account band', 'account band karna', 'delete my data', 'erase my data', 'delete everything', 'quit worthwise', 'leave worthwise'],
      a: "To **delete your account**:\n- **Desktop:** click **Delete account** at the bottom of the left sidebar.\n- **Mobile:** open the **Account** tab in the bottom bar, then tap **Delete account** at the bottom of the sheet.\n- Enter your **password** to confirm.\n\nThis **permanently deletes** your account, financial profile, goals and all purchase decisions, and it **cannot be undone**. If you only want to sign out, use **Logout** instead.",
      hi: "**Account delete** karne ke liye:\n- **Desktop:** left sidebar ke neeche **Delete account** par click karein.\n- **Mobile:** bottom bar mein **Account** tab kholein, phir sheet ke neeche **Delete account** dabayein.\n- Confirm karne ke liye apna **password** daalein.\n\nIsse aapka account, financial profile, goals aur saare purchase decisions **hamesha ke liye delete** ho jate hain, aur ye **wapas nahi ho sakta**. Sirf sign out karna ho to **Logout** use karein.",
      next: ['How do I delete one decision?', 'How do I log out?']
    },
    {
      id: 'delete-decision',
      k: ['delete decision', 'delete a decision', 'delete one decision', 'delete this decision', 'remove decision', 'remove a decision', 'delete purchase', 'delete a purchase', 'remove purchase', 'delete analysis', 'remove analysis', 'delete old analysis', 'decision delete', 'decision delete kaise', 'purchase delete', 'analysis delete', 'trash', 'dustbin'],
      a: "To **delete a single decision**, open **My Decisions** and either:\n- tap the **bin icon** next to the date on its row, or\n- open the decision and press **Delete this decision**.\n\nYou will be asked to confirm. It removes only that analysis from your history, and it **cannot be undone**. Your account and other decisions are not affected.",
      hi: "**Ek decision delete** karne ke liye **My Decisions** kholein aur:\n- uski row par date ke paas wala **bin icon** dabayein, ya\n- decision kholkar **Delete this decision** dabayein.\n\nConfirm karna hoga. Isse sirf wahi analysis history se hatta hai aur ye **wapas nahi ho sakta**. Aapka account aur baaki decisions safe rehte hain.",
      act: [{ label: 'Open My Decisions', hash: '#/decisions' }],
      next: ['How do I delete my account?', 'What does Re-evaluate do?']
    },
    {
      id: 'add-goal',
      k: ['add a goal', 'add goal', 'create a goal', 'create goal', 'new goal', 'how to add goal', 'how to add a goal', 'how do i add a goal', 'how do i create a goal', 'set a goal', 'set goal', 'goal kaise', 'goal kaise banau', 'goal add kaise', 'goal banana', 'create goal form', 'save goal'],
      a: "To add a goal, open the **Goals** page and use the **Create Goal** card at the top:\n- **Goal name** (for example Emergency fund, Laptop, Trip)\n- **Target amount** in ₹\n- **Saved** so far (can be 0)\n- **Target date**\n- **Priority:** High, Medium or Low\n\nThen tap **Save Goal**. It appears as a card with a progress bar, and Worthwise uses it when checking your purchases.",
      hi: "Goal add karne ke liye **Goals** page kholein aur upar wale **Create Goal** card mein bharein: **goal ka naam**, **target amount** (₹), ab tak **saved** (0 bhi chalega), **target date** aur **priority** (High, Medium ya Low). Phir **Save Goal** dabayein. Goal progress bar ke saath dikhega aur purchases check karte waqt Worthwise use dhyan mein rakhega.",
      act: [{ label: 'Open Goals', hash: '#/goals' }],
      next: ['How does goal impact work?', 'What is on the dashboard?']
    },
    {
      id: 'emergency-fund',
      k: ['emergency fund', 'what is emergency fund', 'emergency fund kya', 'emergency fund kya hai', 'protected money', 'safety net', 'safety buffer', 'emergency buffer', 'emergency target'],
      a: "Your **emergency fund** is money you keep aside for unexpected needs.\n- It is **part of your total savings**, so nothing is deducted from your savings when you enter it.\n- Worthwise treats it as **protected money** and warns you when a purchase would eat into it.\n- It cannot be more than your total savings.\n- It counts for up to **35 points** of your Financial Health score.\n\nYou set it on the **Financial Profile** page under Savings.",
      hi: "**Emergency fund** wo paisa hai jo aap achanak aane wale kharchon ke liye alag rakhte hain.\n- Ye aapki **total savings ka hi hissa** hai, isliye daalne par savings se kuch kat'ta nahi.\n- Worthwise ise **protected money** maanta hai, aur agar koi purchase isme haath lagaye to aapko warning deta hai.\n- Ye total savings se zyada nahi ho sakta.\n- Financial Health score mein iske **35 points tak** milte hain.\n\nIse **Financial Profile** page par Savings mein set karein.",
      act: [{ label: 'Open Profile', hash: '#/profile' }],
      next: ['How is the financial health score calculated?', 'What goes in my financial profile?']
    },
    {
      id: 'why-verdict',
      k: ['why wait', 'why skip', 'why buy', 'why did i get wait', 'why did i get skip', 'why did i get buy', 'why is it wait', 'why is it skip', 'why this verdict', 'why this result', 'why not buy', 'why not recommended', 'verdict wrong', 'wrong verdict', 'change verdict', 'change the verdict', 'how to get buy', 'how can i get buy', 'turn wait into buy', 'improve verdict', 'improve my verdict', 'wait kyun', 'skip kyun', 'verdict kyun', 'kyun wait', 'kyun skip'],
      a: "Every verdict has its reasons on the result page, under **Why we recommend...**. Usually it comes down to:\n- your **monthly surplus** (income minus expenses and EMIs)\n- your **savings buffer** and emergency fund after the purchase\n- how many **months** it would delay your goal\n\nTo move from WAIT or SKIP toward BUY: wait and save the surplus, find a **lower price** or a cheaper option, choose **EMI** with a small monthly amount, or improve your numbers on the Financial Profile page. Then use **Re-evaluate** on the saved decision to see the new result.",
      hi: "Har verdict ki wajah result page par **Why we recommend...** mein likhi hoti hai. Aam taur par ye teen cheezein dekhi jati hain:\n- aapka **monthly surplus** (income minus kharche aur EMI)\n- purchase ke baad aapka **savings buffer** aur emergency fund\n- goal kitne **mahine** peeche jayega\n\nWAIT ya SKIP se BUY ki taraf jaane ke liye: ruk kar surplus bachayein, **kam price** ya sasta option dhundhein, chhoti **EMI** chunein, ya Financial Profile mein apne numbers update karein. Phir saved decision par **Re-evaluate** dabayein.",
      act: [{ label: 'Open My Decisions', hash: '#/decisions' }],
      next: ['What does Re-evaluate do?', 'What is Future Affordability?', 'What is Better Options?']
    },
    {
      id: 'ai-explanation',
      k: ['ai take', 'ai explanation', 'what is ai take', 'what is the ai take', 'ai response', 'ai answer', 'standard explanation', 'ai limit', 'ai explanation limit', 'ai explanations used', 'used all ai', 'ai kya hai'],
      a: "The **AI take** on the result page is a short, friendly explanation of your verdict, written for your specific numbers. It appears with a typing effect.\n\nAI explanations are **limited each month**. If you have used them all, Worthwise shows its **standard explanation** instead. The decision itself is calculated in exactly the same way either way, and the limit resets next month.",
      hi: "Result page par **AI take** aapke verdict ka chhota, saral explanation hota hai jo aapke apne numbers par based hota hai. Ye typing effect ke saath dikhta hai.\n\nAI explanations ki **monthly limit** hoti hai. Sab use ho jayein to Worthwise uski jagah **standard explanation** dikhata hai. Decision dono hi case mein ek jaise calculate hota hai, aur limit agle mahine reset ho jati hai.",
      next: ['What are the monthly limits?', 'What is Market Research?']
    },
    {
      id: 'about',
      k: ['what is worthwise', 'what is this app', 'about worthwise', 'what does worthwise do', 'worthwise kya hai', 'ye kya hai', 'yeh kya hai', 'tell me about worthwise', 'introduction', 'purpose', 'tagline'],
      a: "**Worthwise** is a personal purchase decision engine. Its motto is \"Think before you spend.\"\n\nBefore you buy something, Worthwise weighs it against your income, expenses, savings, existing EMIs and goals, then gives a clear, explainable verdict: **BUY**, **WAIT** or **SKIP**.\n\nIt is not a spreadsheet or a general chatbot. It is a structured workspace that walks you through five questions: Can I afford it? What will it change? What is the impact on my goals? What if I wait? What should I do?",
      hi: "**Worthwise** ek personal purchase decision engine hai. Kuch kharidne se pehle ye aapki income, kharche, savings, EMI aur goals ke saath check karta hai, aur saaf verdict deta hai: **BUY**, **WAIT** ya **SKIP**.\n\nYe paanch sawaalon par chalta hai: Kya main afford kar sakta hoon? Isse kya badlega? Goals par kya asar? Agar ruk jaun to? Mujhe kya karna chahiye?",
      next: ['How does it work?', 'How do I get started?', 'Is it free?']
    },
    {
      id: 'how-it-works',
      k: ['how does it work', 'how it works', 'how does worthwise work', 'how worthwise works', 'how does worthwise decide', 'how are decisions made', 'five questions', 'workflow', 'process', 'kaise kaam', 'kaam kaise', 'working'],
      a: "Worthwise follows a simple flow:\n- **Product details:** you enter what you want to buy and its price.\n- **Personal context:** it reuses your saved financial profile (income, expenses, savings, EMIs, preferences). You do not re-enter anything.\n- **Decision:** it checks affordability, goal impact and timing, then shows a verdict with reasons and a plan.\n\nYour profile and goals are the foundation, so the more accurate they are, the sharper the advice.",
      act: [{ label: 'Analyze a purchase', hash: '#/analyze' }],
      next: ['What do BUY, WAIT and SKIP mean?', 'How is affordability checked?']
    },
    {
      id: 'get-started',
      k: ['get started', 'getting started', 'how to start', 'how to use', 'how do i start', 'first step', 'kaise use', 'use kaise', 'kaise shuru', 'shuru', 'setup', 'set up', 'onboarding', 'beginner', 'guide'],
      a: "Quick start:\n- **1.** Create an account (or tap **Try Demo** to look around with no signup).\n- **2.** Fill in your **Financial Profile**: income, expenses, savings and emergency fund.\n- **3.** Add a **Goal** you are saving toward.\n- **4.** Open **Analyze Purchase**, enter what you want to buy, and get your verdict.\n\nSetting up your profile once is enough. Every analysis after that is quick.",
      hi: "Shuru karne ke steps:\n- **1.** Account banayein (ya bina signup ke **Try Demo** dabayein).\n- **2.** **Financial Profile** bharein: income, kharche, savings, emergency fund.\n- **3.** Ek **Goal** add karein.\n- **4.** **Analyze Purchase** kholein, jo kharidna hai wo daalein, aur verdict paayein.",
      act: [{ label: 'Create account', hash: '#/auth' }, { label: 'Try demo', demo: true }],
      next: ['What is the demo?', 'What goes in my financial profile?']
    },
    {
      id: 'verdicts',
      k: ['buy', 'wait', 'skip', 'verdict', 'verdicts', 'recommendation', 'recommendations', 'what does buy mean', 'what does wait mean', 'what does skip mean', 'buy wait skip', 'result meaning', 'decision types', 'kharidu', 'kharidna chahiye'],
      a: "Every analysis ends with one of three verdicts:\n- \u2705 **BUY:** the purchase fits your cash flow and does not hurt your goals or emergency buffer in a meaningful way.\n- \u23F3 **WAIT:** it is affordable later, not comfortably now. You also get a recommended wait time and a safe price range for your budget.\n- \u274C **SKIP:** it would strain your finances or push your goals back too far.\n\nSometimes the result suggests a better alternative instead. Each verdict comes with the reasons behind it.",
      hi: "Har analysis ka ek verdict hota hai:\n- \u2705 **BUY:** purchase aapke cash flow mein fit hai aur goals ya emergency buffer ko zyada nuksaan nahi karta.\n- \u23F3 **WAIT:** abhi comfortable nahi, baad mein affordable. Saath mein wait time aur safe price range milti hai.\n- \u274C **SKIP:** isse aapki finances par dabaav padega ya goals bahut peeche chale jayenge.",
      next: ['What is on the results page?', 'How does goal impact work?']
    },
    {
      id: 'affordability',
      k: ['afford', 'affordable', 'affordability', 'can i afford', 'kharid sakta', 'kharid sakti', 'cash flow', 'cashflow', 'savings buffer', 'existing emi', 'enough money'],
      a: "Affordability in Worthwise goes beyond \"is the money in my account today?\" It checks:\n- your **cash flow** (income minus expenses, i.e. monthly surplus)\n- your **savings buffer** and emergency fund\n- your **existing EMIs** and any EMI the new purchase adds\n\nThat is why a purchase can look affordable on paper and still get a WAIT.",
      next: ['How does goal impact work?', 'How is the financial health score calculated?']
    },
    {
      id: 'goal-impact',
      k: ['goal impact', 'impact on goals', 'impact on my goals', 'goal delay', 'delays my goal', 'delay my goal', 'delay', 'delays', 'goal timeline', 'goal completion', 'with and without', 'financial impact', 'before and after', 'how many months'],
      a: "Worthwise shows exactly how a purchase shifts your goals, in **months**, not vague warnings.\n\nThe **Financial Impact** card compares two columns, *without purchase* and *with purchase*, for:\n- your savings\n- your monthly surplus\n- your goal completion date\n\nIf a purchase pushes your goal date back, you will see the new date. Waiting a few months and saving the surplus usually removes most of the impact.",
      next: ['How do I add a goal?', 'What is Future Affordability?']
    },
    {
      id: 'analyze',
      k: ['analyze', 'analyse', 'analysis', 'analyze a purchase', 'new analysis', 'evaluate', 'check a purchase', 'product details', 'product name', 'category', 'categories', 'purchase form', 'step 1', 'product url', 'how to analyze', 'kaise analyze', 'what can i analyze'],
      a: "To analyze a purchase, open **Analyze Purchase** and fill in step 1:\n- **Product name** (e.g. headphones, course, phone)\n- **Category:** Electronics, Home & Furniture, Fashion, Health & Fitness, Travel, Education or Other\n- **Price** in ₹\n- **Purchase type:** One-time or EMI\n- **Why do you want this?** (a sentence or two helps)\n- **Product URL** (optional, meant for auto-filling price and specs later)\n\nStep 2 shows the financial profile Worthwise will use. Tap **Analyze Purchase** and you get your decision.",
      hi: "Purchase analyze karne ke liye **Analyze Purchase** kholein aur step 1 bharein: product name, category, price (₹), purchase type (One-time ya EMI), aur kyun chahiye. Product URL optional hai. Step 2 mein aapki financial profile dikhti hai, phir **Analyze Purchase** dabayein.",
      act: [{ label: 'Open Analyze', hash: '#/analyze' }],
      next: ['How does EMI work here?', 'What is on the results page?']
    },
    {
      id: 'emi',
      k: ['emi', 'down payment', 'monthly emi', 'emi duration', 'installment', 'installments', 'instalment', 'loan', 'one-time', 'one time', 'total cost', 'purchase type', 'kist'],
      a: "Choose **EMI** as the purchase type and three extra fields appear:\n- **Down payment** (enter 0 if none)\n- **Monthly EMI** in ₹\n- **EMI duration** in months\n\nWorthwise then shows the **total cost** of the purchase, and uses the EMI to work out how your monthly surplus changes. With **One-time**, the full price is treated as paid upfront.",
      next: ['How is affordability checked?', 'What goes in my financial profile?']
    },
    {
      id: 'results',
      k: ['results', 'result page', 'results page', 'why we recommend', 'reasons', 'why recommended', 'action plan', 'purchase plan', 'save purchase plan', 'save plan', 'explanation', 'ai explanation', 'ai take', 'why this decision', 'what do i get'],
      a: "Your result page has these sections:\n- **Verdict** with a score dial\n- **Why we recommend...:** the reasons behind it, plus an AI explanation\n- **Financial Impact:** with vs. without the purchase\n- **Better Options** and **Market Research** (cheaper or similar products)\n- **Future Affordability:** when it becomes comfortable\n- **Your Purchase Plan:** concrete steps, with buttons **Save Purchase Plan**, **Done this purchase** and **Analyze Another Purchase**",
      next: ['What is Future Affordability?', 'What is Better Options?']
    },
    {
      id: 'future',
      k: ['future affordability', 'timeline', 'when can i buy', 'when can i afford', 'wait time', 'recommended wait', 'safe price', 'price range', 'kab tak', 'what if', 'what if i wait', 'simulate', 'simulator', 'extra saving', 'discount'],
      a: "**Future Affordability** shows how the picture changes over time, based on your current savings rate. It answers \"What if I wait?\"\n\nFor a WAIT verdict you also get a **recommended wait time** and a **safe price range** that fits your budget. Waiting a few months while saving your surplus, or finding the item at a lower price, can turn a WAIT into a BUY.",
      next: ['What do BUY, WAIT and SKIP mean?', 'What is Better Options?']
    },
    {
      id: 'alternatives',
      k: ['better options', 'alternatives', 'alternative', 'cheaper', 'cheaper options', 'other options', 'substitute', 'sasta', 'sasti'],
      a: "**Better Options** suggests alternatives that suit your budget better than the original purchase, and shows how much you would save by choosing one. It sits on the result page next to **Market Research**.",
      next: ['What is Market Research?', 'What is on the results page?']
    },
    {
      id: 'market',
      k: ['market research', 'live product search', 'product search', 'online search', 'search limit', 'around your price', 'around my price', 'similar products', 'compare prices', 'view product', 'retailer'],
      a: "**Market Research** looks up real products online and groups them as:\n- **Around your entered price**\n- **Cheaper options**\n\nEach card has a **View product** button that opens the retailer page. Live search counts toward your monthly search limit. If you have used all of it, market research pauses until the limit resets, but your decision and affordability numbers are not affected.",
      next: ['What are the monthly limits?', 'What is Better Options?']
    },
    {
      id: 'usage',
      k: ['api usage', 'usage', 'limit', 'limits', 'limit reached', 'quota', 'monthly limit', 'searches used', 'used all', 'resets', 'reset date', 'how many analyses', 'how many searches'],
      a: "Your **purchase decisions are always calculated**, with no limit. Only two things are limited each month:\n- the **AI explanation**\n- the **live product search** (Market Research)\n\nThe dashboard card **API Usage This Month** shows how many you have used and how many remain, along with the date they reset. When a limit is reached the rest of the analysis still works normally.",
      act: [{ label: 'Open dashboard', hash: '#/dashboard' }],
      next: ['What is Market Research?', 'What is on the dashboard?']
    },
    {
      id: 'health',
      k: ['financial health', 'health score', 'score', 'health', 'dial', 'at risk', 'needs attention', 'out of 100', '/100', 'improve score', 'improve my score', 'how is score calculated', 'calculated', 'sehat'],
      a: "Your **Financial Health** score is out of 100 and combines three things:\n- **Savings rate** (up to 55 points)\n- **Emergency fund progress** toward your target (up to 35 points)\n- **A non-negative monthly surplus** (10 points)\n\nLabels: **Good** (75 and above), **Needs attention** (45 to 74), **At risk** (below 45). If no income is saved yet it shows **Set up profile**.\n\nTo raise it: increase your surplus, build your emergency fund, and keep expenses below income.",
      act: [{ label: 'Edit profile', hash: '#/profile' }],
      next: ['What goes in my financial profile?', 'What is on the dashboard?']
    },
    {
      id: 'dashboard',
      k: ['dashboard', 'overview', 'home page', 'snapshot', 'recent decisions', 'main page', 'overview page', 'greeting'],
      a: "The **Overview** dashboard shows:\n- a **financial snapshot** (income, expenses, savings, surplus, with helpful indicators)\n- **Financial Health** score and metrics (savings rate, surplus, debt burden, emergency buffer)\n- your top **goal** progress\n- **API Usage This Month**\n- **Recent Decisions** and **Planned Purchases**\n\nThere is also an **Analyze a Purchase** button at the top.",
      act: [{ label: 'Open dashboard', hash: '#/dashboard' }],
      next: ['What are Planned Purchases?', 'How is the financial health score calculated?']
    },
    {
      id: 'decisions',
      k: ['my decisions', 'decisions', 'history', 'past decisions', 'filter', 'search purchases', 'revisit', 'saved decisions', 'past analyses', 'previous analysis', 'old analysis'],
      a: "**My Decisions** stores every purchase you have analyzed so you can revisit the reasoning later.\n- Filter by **All, Buy, Wait or Skip**\n- **Search** by product name\n- Tap any row to open the details: **Why this decision** and the **Action plan**\n- From there you can **Re-evaluate**, mark **Done this purchase**, or delete the decision",
      act: [{ label: 'Open My Decisions', hash: '#/decisions' }],
      next: ['What does Re-evaluate do?', 'What does "Done this purchase" do?']
    },
    {
      id: 'reevaluate',
      k: ['re-evaluate', 'reevaluate', 'revaluate', 're evaluate', 'evaluate again', 'run again', 'recheck', 're-run', 'rerun', 'update decision', 'refresh decision'],
      a: "**Re-evaluate** re-runs a saved decision using your **current** profile. Use it after your income, savings or goals change, for example when a WAIT might have become a BUY. You find it in the decision's detail view.",
      next: ['How do I update my profile?', 'What does "Done this purchase" do?']
    },
    {
      id: 'done',
      k: ['done this purchase', 'purchased', 'i bought', 'bought it', 'mark as bought', 'mark purchased', 'already bought', 'mark done', 'done purchase', 'kharid liya'],
      a: "**Done this purchase** tells Worthwise you actually bought the item. It updates your **savings and monthly surplus** in your profile, so your financial health and all future analyses reflect the real numbers. You will find the button on the result page and in a decision's details.",
      next: ['How is the financial health score calculated?', 'What are Planned Purchases?']
    },
    {
      id: 'planned',
      k: ['planned purchases', 'planned', 'saving toward', 'waiting list', 'saved plan', 'plan for purchase'],
      a: "**Planned Purchases** lists the items you decided to wait on, with a progress bar showing how close you are to affording them. It appears on the dashboard under \"Saving toward these already\". Use **Save Purchase Plan** on a result to track it there.",
      next: ['What is Future Affordability?', 'What is on the dashboard?']
    },
    {
      id: 'goals',
      k: ['goal', 'goals', 'add goal', 'create goal', 'new goal', 'savings goal', 'target amount', 'target date', 'goal priority', 'priority', 'lakshya', 'save for'],
      a: "On the **Goals** page you set what you are saving toward. Each goal has:\n- a **name**\n- a **target amount** (₹)\n- how much you have **saved** so far\n- a **target date**\n- a **priority:** High, Medium or Low\n\nWorthwise checks every purchase against your goals before recommending BUY, and your top-priority goal is shown on the dashboard.",
      act: [{ label: 'Open Goals', hash: '#/goals' }],
      next: ['How does goal impact work?', 'What is on the dashboard?']
    },
    {
      id: 'profile',
      k: ['profile', 'financial profile', 'income', 'expenses', 'expense', 'salary', 'monthly income', 'savings', 'emergency fund', 'emergency', 'edit profile', 'update profile', 'save changes', 'discard', 'breakdown', 'housing', 'transport', 'subscriptions', 'negative', 'surplus', 'kamai', 'tankhwah'],
      a: "Your **Financial Profile** powers every affordability check. It has:\n- **Income:** monthly take-home\n- **Expenses:** a monthly breakdown (housing, food, transport, subscriptions, other)\n- **Savings:** your total, including the emergency fund\n- **Emergency fund:** treated as protected money, with a warning if a purchase would eat into it\n- **Preferences** and **Settings**\n\nPress **Save Changes** to store edits (or **Discard** to undo). Values cannot be negative, and expenses higher than income are not accepted.",
      hi: "**Financial Profile** mein ye cheezein hoti hain: **Income** (monthly take-home), **Expenses** (housing, food, transport, subscriptions, other), **Savings** (emergency fund samet) aur **Emergency fund**. Badlav ke baad **Save Changes** dabayein. Values negative nahi ho sakti, aur expenses income se zyada nahi ho sakte.",
      act: [{ label: 'Open Profile', hash: '#/profile' }],
      next: ['What are the preferences?', 'How is the financial health score calculated?']
    },
    {
      id: 'preferences',
      k: ['preferences', 'preference', 'risk tolerance', 'risk', 'saving priority', 'purchase preference', 'conservative', 'value over brand', 'quality first', 'quality-first', 'goal-first', 'goal first', 'flexible', 'balanced'],
      a: "In the profile, **Preferences** tune how conservative Worthwise is:\n- **Risk tolerance:** Low, Moderate or High\n- **Saving priority:** Goal-first, Balanced or Flexible\n- **Purchase preference:** Value over brand, Quality-first or Balanced\n\nA lower risk tolerance and a goal-first priority make recommendations more cautious.",
      act: [{ label: 'Open Profile', hash: '#/profile' }],
      next: ['What goes in my financial profile?']
    },
    {
      id: 'settings',
      k: ['settings', 'notifications', 'email notifications', 'weekly summary', 'weekly financial health summary', 'currency', 'inr', 'rupee', 'rupees', 'dollar', 'dollars', 'usd'],
      a: "The **Settings** card (at the bottom of the Financial Profile page) shows your account preferences: email notifications for new analyses, the weekly financial health summary, and the currency, which is **INR (₹)**. Worthwise currently works in Indian rupees only.",
      act: [{ label: 'Open Settings', hash: '#/profile' }]
    },
    {
      id: 'signup',
      k: ['sign up', 'signup', 'register', 'create account', 'create an account', 'new account', 'otp', 'verification', 'verification code', 'verify', 'code not received', "didn't get code", 'resend code', 'resend', 'change email', 'account banao', 'account kaise banau', 'password length'],
      a: "To create an account:\n- **1.** Open **Get Started**, then the **Create account** tab.\n- **2.** Enter your **name, gender, email** and a **password** (at least 8 characters).\n- **3.** Tap **Send verification code**. A 6-digit code is emailed to you.\n- **4.** Enter it and tap **Verify and create account**.\n\nDid not get the code? Use **Resend code**, or **Change email** if you typed it wrong. Check your spam folder too.",
      hi: "Account banane ke liye: **Get Started** > **Create account** tab > naam, gender, email aur password (kam se kam 8 characters) daalein > **Send verification code** dabayein > email mein aaya 6-digit code daalein > **Verify and create account**. Code na aaye to **Resend code** ya **Change email** use karein, aur spam folder bhi dekhein.",
      act: [{ label: 'Create account', hash: '#/auth' }, { label: 'Try demo', demo: true }],
      next: ['What is the demo?', 'How do I log in?']
    },
    {
      id: 'login',
      k: ['login', 'log in', 'sign in', 'signin', 'forgot password', 'reset password', 'password', 'cant login', "can't login", 'cannot login', 'unauthorized', 'session expired', 'logged out'],
      a: "Use the **Login** tab on the account page with your email and password. If you are sent back to the login screen, your session has probably expired, so just sign in again.\n\nI cannot see or reset passwords. If you are stuck, you can always use **Try Demo** to explore without an account.",
      act: [{ label: 'Go to login', hash: '#/auth' }, { label: 'Try demo', demo: true }]
    },
    {
      id: 'demo',
      k: ['demo', 'try demo', 'no signup', 'without signup', 'without account', 'test account', 'trial', 'guest', 'demo account', 'try without'],
      a: "**Try Demo** opens a ready-made demo account, with no signup and no email needed. It is the quickest way to see a full analysis, the dashboard, goals and decisions. You will find the button on the landing page and on both the Login and Create account tabs. The demo gives you **2 analyses**; after that, create a free account with your real email to keep going.",
      act: [{ label: 'Try demo', demo: true }],
      next: ['How do I create an account?', 'How do I analyze a purchase?']
    },
    {
      id: 'logout',
      k: ['logout', 'log out', 'sign out', 'signout', 'logging out'],
      a: "On desktop, use the **Logout** and **Delete account** buttons at the bottom of the left sidebar (on mobile, open your profile from the bottom bar). **Delete account** asks you to confirm with your password before anything is removed, so please be sure before you proceed.",
      next: ['What data does Worthwise store?']
    },
    {
      id: 'theme',
      k: ['theme', 'dark mode', 'light mode', 'dark', 'light', 'night mode', 'toggle', 'appearance', 'color mode', 'colour mode'],
      a: "Use the **sun / moon button** to switch between dark and light mode. It sits in the top bar of the landing page and in the app. Your choice is remembered on this device, so there is no flash of the wrong theme when you return."
    },
    {
      id: 'mobile',
      k: ['mobile', 'phone', 'android', 'iphone', 'ios', 'bottom bar', 'bottom nav', 'responsive', 'tablet', 'desktop', 'install', 'pwa', 'app store', 'play store'],
      a: "Worthwise works in any modern browser on desktop, tablet and phone. On desktop you navigate with the left sidebar (Overview, Analyze Purchase, My Decisions, Goals, Financial Profile, Settings). On mobile the sidebar becomes a **bottom bar** with Overview, Analyze, Decisions and Goals. There is no separate app to install."
    },
    {
      id: 'privacy',
      k: ['privacy', 'secure', 'security', 'safe', 'data', 'stored', 'my data', 'private', 'confidential', 'encrypted', 'who can see', 'shared', 'trust', 'store my'],
      a: "Your profile, goals and decisions are stored **under your own account** and you must sign in to see them. Deleting your account is available from the sidebar and needs your password.\n\nI do not have details about the server's security setup, so for anything formal please check with the Worthwise team. Please avoid typing passwords or card numbers into this chat."
    },
    {
      id: 'pricing',
      k: ['pricing', 'cost of worthwise', 'subscription', 'how much does it cost', 'is it free', 'free or paid', 'paid', 'charges', 'fees', 'fee', 'premium', 'free hai', 'paise lagte'],
      a: "Worthwise is currently a **prototype build**, and I do not have any pricing information. The only limits I know of are the monthly caps on AI explanations and live product searches, which you can see on your dashboard.",
      next: ['What are the monthly limits?']
    },
    {
      id: 'slow',
      k: ['slow', 'loading', 'load', 'so long', 'too long', 'long time', 'waking up', 'wake up', 'wake', 'takes time', 'taking long', 'stuck', 'not loading', 'server', 'render', 'first time', 'cold start', 'kitna time'],
      a: "When you open Worthwise you may see **\"Waking up Worthwise\"** for a few seconds. The server goes to sleep when nobody is using it and needs a moment to start, mostly the first time you visit. It usually clears up by itself within about 20 to 30 seconds. If it still hangs, refresh the page."
    },
    {
      id: 'troubleshoot',
      k: ['error', 'not working', 'bug', 'problem', 'issue', 'failed', 'fail', 'broken', 'something went wrong', 'crash', 'blank', 'white screen', 'doesnt work', "doesn't work", 'kaam nahi'],
      a: "Sorry you hit a problem. Try these in order:\n- Refresh the page and wait for \"Waking up Worthwise\" to finish.\n- If you were sent to the login screen, sign in again.\n- Check that income, savings and expenses are not negative, and that expenses are not higher than income.\n- If an analysis shows no market research, your monthly search limit may be used up (the rest still works).\n\nTell me exactly what you see and I will help narrow it down."
    },
    {
      id: 'advice',
      k: ['financial advice', 'is it advice', 'advisor', 'adviser', 'professional', 'investment', 'invest', 'stocks', 'stock market', 'mutual fund', 'sip', 'tax', 'credit card', 'trust the result', 'accurate', 'accuracy', 'reliable'],
      a: "Worthwise helps you reason about **purchases** using your own numbers. It is a decision aid, not professional financial, tax or investment advice, and it does not recommend investments. The result is only as accurate as the profile and goals you enter, so keep them up to date, and for big financial decisions consider talking to a qualified advisor."
    },
    {
      id: 'tech',
      k: ['technology', 'tech stack', 'built with', 'built using', 'framework', 'react', 'backend', 'team', 'contact', 'support', 'email us', 'feedback', 'prototype', 'open source'],
      a: "Worthwise is a **prototype build**: a single-page web app (HTML, CSS and JavaScript) talking to a hosted backend. It was built by **Mr. Chetan**. I do not have contact details to share, so for feedback please reach out to whoever shared this app with you."
    },
    {
      id: 'capabilities',
      k: ['what can you do', 'help', 'your capabilities', 'what can i ask', 'topics', 'commands', 'how can you help', 'menu', 'options'],
      a: "I can explain anything about Worthwise:\n- how analysis works and what **BUY / WAIT / SKIP** mean\n- EMI, goals, profile fields and preferences\n- the dashboard, decisions, planned purchases and usage limits\n- accounts, demo mode, themes and troubleshooting\n\nWhen you are logged in you can also ask about **your own numbers**, for example \"my financial health\", \"my savings\" or \"my goals\".",
      next: ['What is Worthwise?', 'How is the financial health score calculated?', 'Show my financial health']
    },
    {
      id: 'who',
      k: ['who are you', 'your name', 'are you a bot', 'are you ai', 'are you human', 'are you chatgpt', 'which ai', 'kaun ho', 'tum kaun', 'aap kaun'],
      a: "I'm the **Worthwise Assistant**, the built-in help bot for this app. I answer questions about how Worthwise works, and if you are logged in I can read your own profile and goals to answer \"my...\" questions. I was made by **Mr. Chetan**. I only discuss Worthwise, so I cannot help with unrelated topics."
    },
    {
      id: 'thanks',
      k: ['thanks', 'thank you', 'thx', 'ty', 'shukriya', 'dhanyavad', 'great', 'awesome', 'nice', 'cool', 'perfect', 'got it', 'theek hai', 'accha', 'acha'],
      a: "You're welcome! Ask me anything else about Worthwise whenever you like.",
      hi: "Aapka swagat hai! Worthwise ke baare mein kuch aur poochna ho to zaroor poochiye."
    },
    {
      id: 'bye',
      k: ['bye', 'goodbye', 'see you', 'later', 'exit', 'cya', 'alvida'],
      a: "Goodbye! Spend smarter, live better.",
      hi: "Alvida! Smart kharch karein, behtar jeeyein."
    }
  ];

  var FALLBACK = {
    a: "I'm not sure about that one. I can only help with **Worthwise**: analyzing purchases, BUY / WAIT / SKIP, goals, your profile, the dashboard, your account, or usage limits. Try one of the suggestions below, or rephrase your question.",
    hi: "Ye mujhe samajh nahi aaya. Main sirf **Worthwise** ke baare mein madad kar sakta hoon: purchase analyze karna, BUY / WAIT / SKIP, goals, profile, dashboard, account ya limits. Neeche diye sujhaav try karein ya sawaal dobara likhein.",
    next: ['What is Worthwise?', 'How do I analyze a purchase?', 'What do BUY, WAIT and SKIP mean?', 'Show my financial health']
  };

  var DEFAULT_CHIPS = [
    'What is Worthwise?',
    'How do I analyze a purchase?',
    'What do BUY, WAIT and SKIP mean?',
    'How is the financial health score calculated?',
    'Show my financial health',
    'What is the demo?'
  ];

  /* ------------------------------------------------------------------ *
   * Text helpers
   * ------------------------------------------------------------------ */
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[\u2019\u2018]/g, "'")
      .replace(/[^a-z0-9\s'\/\-]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function tokenize(t) { return t ? t.split(' ') : []; }

  var HINGLISH = ('kaise kya hai hain karu karna kare karo mujhe mera meri mere kyu kyun nahi nahin batao bataiye batayiye chahiye ' +
    'paisa paise kharcha kharch bachat kitna kitne kab kahan aap tum mein hota hoti wala wali banana banao dikhao samjhao matlab ' +
    'bhai yaar shukriya dhanyavad theek accha acha kaun lagte lagta sakta sakti shuru kaam').split(' ');

  function isHinglish(t) {
    var toks = tokenize(t), hits = 0;
    for (var i = 0; i < toks.length; i++) if (HINGLISH.indexOf(toks[i]) !== -1) hits++;
    return hits >= 1;
  }

  // Score one knowledge entry against the (normalised) user text.
  function scoreEntry(entry, text, tokenSet, tokens) {
    var score = 0;
    for (var i = 0; i < entry.k.length; i++) {
      var kw = entry.k[i];
      if (kw.indexOf(' ') !== -1) {
        if (text.indexOf(kw) !== -1) score += 3 + kw.split(' ').length;
      } else if (tokenSet[kw]) {
        score += 2;
      } else if (kw.length >= 4) {
        // light stemming: "purchases" ~ "purchase", "analyzing" ~ "analyze"
        for (var j = 0; j < tokens.length; j++) {
          var tk = tokens[j];
          if (tk.length >= 4 && (tk.indexOf(kw) === 0 || kw.indexOf(tk) === 0) && Math.abs(tk.length - kw.length) <= 3) { score += 1; break; }
        }
      }
    }
    return score;
  }

  function findAnswer(userText) {
    var text = norm(userText);
    if (!text) return null;
    var tokens = tokenize(text), tokenSet = {};
    tokens.forEach(function (t) { tokenSet[t] = true; });

    var best = null, bestScore = 0;
    for (var i = 0; i < KNOWLEDGE.length; i++) {
      var s = scoreEntry(KNOWLEDGE[i], text, tokenSet, tokens);
      if (s > bestScore) { best = KNOWLEDGE[i]; bestScore = s; }
    }
    // Very short greetings like "hi" are fine at score 2; anything else needs a real match.
    if (!best || bestScore < 2) return null;
    return best;
  }

  /* ------------------------------------------------------------------ *
   * Personalised answers ("my financial health", "my goals", ...)
   * Reads from the app's own SpendWiseAPI — nothing leaves the browser.
   * ------------------------------------------------------------------ */
  function personalKind(text) {
    var t = norm(text);
    // Only treat it as a data request when the user is *asking to see* their numbers,
    // not when they ask "how do I update my profile?".
    var asksForData =
      /\b(show|tell|give|see|view|check|display|dikhao|batao|bataiye|batayiye)\b.*\b(my|mera|meri|mere)\b/.test(t) ||
      /\b(what is|what's|whats|how much is|how much are|how is|how are|what are)\s+my\b/.test(t) ||
      /\b(mera|meri|mere)\b.*\b(kitna|kitni|kya hai|kaisa|kaisi|dikhao|batao)\b/.test(t) ||
      /^my\s+\w+(\s+\w+)?$/.test(t);
    if (!asksForData) return null;
    if (/\b(goal|goals|lakshya)\b/.test(t)) return 'goals';
    if (/\b(health|score|sehat)\b/.test(t)) return 'health';
    if (/\b(savings?|income|expenses?|surplus|salary|profile|numbers?|finances?|financial|bachat|kamai|kharch|kharcha|emergency)\b/.test(t)) return 'profile';
    return null;
  }

  function inr(n) {
    var v = Number(n || 0);
    return '\u20B9' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function loginPrompt() {
    return {
      text: "\uD83D\uDD10 I can answer that once you are signed in, since I read your numbers from your own account. Log in, or tap **Try Demo** to see it with a sample account.",
      actions: [{ label: 'Log in', hash: '#/auth' }, { label: 'Try demo', demo: true }]
    };
  }

  function personalReply(kind) {
    var api = root.SpendWiseAPI || (typeof SpendWiseAPI !== 'undefined' ? SpendWiseAPI : null);
    if (!api || typeof api.isAuthenticated !== 'function' || !api.isAuthenticated()) {
      return Promise.resolve(loginPrompt());
    }

    if (kind === 'goals') {
      return api.getGoals().then(function (goals) {
        goals = (goals || []).filter(function (g) { return g && !g.isPlaceholder; });
        if (!goals.length) {
          return { text: "You have not saved any goals yet. Add one so Worthwise can check purchases against it.", actions: [{ label: 'Add a goal', hash: '#/goals' }] };
        }
        var lines = goals.slice(0, 5).map(function (g) {
          var tgt = Number(g.targetAmount || 0), cur = Number(g.currentAmount || 0);
          var pct = tgt > 0 ? Math.round(cur / tgt * 100) : 0;
          var d = g.targetDate ? new Date(g.targetDate) : null;
          var when = d && !isNaN(d) ? ' by ' + d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';
          return '- **' + (g.name || 'Goal') + ':** ' + inr(cur) + ' of ' + inr(tgt) + ' (' + pct + '%)' + when + (g.priority ? ', ' + String(g.priority).toLowerCase() + ' priority' : '');
        });
        return { text: "Here are your goals:\n" + lines.join('\n'), actions: [{ label: 'Open Goals', hash: '#/goals' }] };
      }).catch(function () {
        return { text: "I could not load your goals right now. Please try again in a moment.", actions: [{ label: 'Open Goals', hash: '#/goals' }] };
      });
    }

    return api.getFinancialProfile().then(function (p) {
      var income = Number(p.monthlyIncome || 0), exp = Number(p.monthlyExpenses || 0);
      if (income <= 0) {
        return { text: "Your financial profile is still empty, so there is nothing to score yet. Add your income, expenses and savings first.", actions: [{ label: 'Set up profile', hash: '#/profile' }] };
      }
      var surplus = income - exp, savings = Number(p.currentSavings || 0);
      var health = (typeof computeHealth === 'function') ? computeHealth(p) : null;

      if (kind === 'health') {
        var rate = Math.round(Number(p.savingsRate || 0) * 100);
        var msg = health
          ? "Your financial health is **" + health.score + "/100 (" + health.label + ")**.\n"
          : "Here is your financial position.\n";
        msg += "- Savings rate: **" + rate + "%**\n- Monthly surplus: **" + inr(surplus) + "**\n- Savings: **" + inr(savings) + "**";
        if (Number(p.emergencyFundTarget || 0) > 0) {
          msg += "\n- Emergency fund target: **" + inr(p.emergencyFundTarget) + "** (" + Math.round(Math.min(savings / p.emergencyFundTarget, 9.99) * 100) + "% covered by savings)";
        }
        if (surplus < 0) msg += "\n\nYour expenses are higher than your income, so purchases should wait until cash flow improves.";
        return { text: msg, actions: [{ label: 'Open dashboard', hash: '#/dashboard' }] };
      }

      var out = "Your numbers right now:\n- Monthly income: **" + inr(income) + "**\n- Monthly expenses: **" + inr(exp) + "**\n- Monthly surplus: **" + inr(surplus) + "**\n- Current savings: **" + inr(savings) + "**";
      if (health) out += "\n- Financial health: **" + health.score + "/100 (" + health.label + ")**";
      return { text: out, actions: [{ label: 'Edit profile', hash: '#/profile' }] };
    }).catch(function () {
      return { text: "I could not load your profile right now. Please try again in a moment.", actions: [{ label: 'Open Profile', hash: '#/profile' }] };
    });
  }

  /* ------------------------------------------------------------------ *
   * System prompt built from the knowledge base (for an optional LLM backend)
   * ------------------------------------------------------------------ */
  function buildSystemPrompt() {
    var facts = KNOWLEDGE.filter(function (e) { return ['greeting', 'thanks', 'bye'].indexOf(e.id) === -1; })
      .map(function (e) { return '## ' + e.id + '\n' + e.a.replace(/\*\*/g, ''); }).join('\n\n');
    return 'You are the Worthwise Assistant, the help bot inside the Worthwise web app (a personal purchase decision engine that gives BUY / WAIT / SKIP verdicts). ' +
      'Answer ONLY using the facts below. If something is not covered, say you are not sure and suggest what you can help with. ' +
      'Never give investment, tax or legal advice. Reply in the same language the user writes in (English or Hinglish). Keep answers short and friendly.\n\n' + facts;
  }

  /* ------------------------------------------------------------------ *
   * Reply pipeline
   * ------------------------------------------------------------------ */
  var history = [];   // [{ role: 'user'|'bot', text, actions?, ts }]

  var EMOJI = {
    'greeting': '\uD83D\uDC4B', 'good-morning': '\u2600\uFE0F', 'good-afternoon': '\uD83C\uDF24\uFE0F', 'good-evening': '\uD83C\uDF07', 'good-night': '\uD83C\uDF19',
    'creator': '\uD83D\uDC68\u200D\uD83D\uDCBB', 'how-are-you': '\uD83D\uDE04', 'name': '\uD83E\uDD16', 'joke': '\uD83D\uDE02', 'compliment': '\uD83E\uDD70',
    'sorry-ok': '\uD83D\uDC4D', 'language': '\uD83D\uDDE3\uFE0F', 'age-place': '\uD83E\uDD16', 'saving-tip': '\uD83D\uDC37',
    'about': '\uD83D\uDCA1', 'how-it-works': '\u2699\uFE0F', 'get-started': '\uD83D\uDE80', 'verdicts': '\uD83D\uDEA6', 'affordability': '\uD83D\uDCB0',
    'goal-impact': '\uD83C\uDFAF', 'analyze': '\uD83D\uDD0D', 'emi': '\uD83C\uDFE6', 'results': '\uD83D\uDCCB', 'future': '\u23F3', 'alternatives': '\uD83D\uDCB8',
    'market': '\uD83D\uDED2', 'usage': '\uD83D\uDCC8', 'health': '\uD83D\uDC9A', 'dashboard': '\uD83D\uDCCA', 'decisions': '\uD83D\uDDC2\uFE0F', 'reevaluate': '\uD83D\uDD04',
    'done': '\u2705', 'planned': '\uD83D\uDCCC', 'goals': '\uD83C\uDFAF', 'profile': '\uD83D\uDC64', 'preferences': '\uD83C\uDF9B\uFE0F', 'settings': '\u2699\uFE0F',
    'signup': '\uD83D\uDCDD', 'login': '\uD83D\uDD10', 'demo': '\uD83C\uDFAE', 'logout': '\uD83D\uDEAA', 'theme': '\uD83C\uDF17', 'mobile': '\uD83D\uDCF1',
    'privacy': '\uD83D\uDD12', 'pricing': '\uD83C\uDFF7\uFE0F', 'slow': '\uD83D\uDE34', 'troubleshoot': '\uD83D\uDEE0\uFE0F', 'advice': '\u2696\uFE0F',
    'tech': '\uD83E\uDDD1\u200D\uD83D\uDCBB', 'capabilities': '\uD83E\uDD16', 'who': '\uD83E\uDD16', 'thanks': '\uD83D\uDE0A', 'bye': '\uD83D\uDC4B'
  };
  EMOJI['demo-limit'] = '\uD83C\uDF9F\uFE0F'; EMOJI['account-limit'] = '\uD83D\uDCE6'; EMOJI['delete-account'] = '\uD83D\uDDD1\uFE0F'; EMOJI['delete-decision'] = '\uD83D\uDDD1\uFE0F';
  EMOJI['add-goal'] = '\uD83C\uDFAF'; EMOJI['emergency-fund'] = '\uD83D\uDEDF'; EMOJI['why-verdict'] = '\uD83E\uDDD0'; EMOJI['ai-explanation'] = '\u2728';
  function withEmoji(text, e) { return e ? e + ' ' + text : text; }

  function localReply(text) {
    var entry = findAnswer(text);
    var hing = isHinglish(norm(text));
    if (entry) {
      return { text: withEmoji((hing && entry.hi) ? entry.hi : entry.a, EMOJI[entry.id]), actions: entry.act || [], next: entry.next || [] };
    }
    return { text: withEmoji(hing ? FALLBACK.hi : FALLBACK.a, '\uD83E\uDD14'), actions: [], next: FALLBACK.next };
  }

  function aiReply(text) {
    return fetch(CONFIG.aiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: history.slice(-8).map(function (m) { return { role: m.role, text: m.text }; }),
        systemPrompt: buildSystemPrompt()
      })
    }).then(function (res) {
      if (!res.ok) throw new Error('bad status');
      return res.json();
    }).then(function (data) {
      if (!data || !data.reply) throw new Error('empty');
      return { text: String(data.reply), actions: [], next: [] };
    });
  }

  function respond(text) {
    var kind = personalKind(text);
    if (kind) return personalReply(kind).then(function (r) {
      if (!/^[\u2600-\u27BF\uD83C-\uDBFF]/.test(r.text)) r.text = withEmoji(r.text, { goals: '\uD83C\uDFAF', health: '\uD83D\uDC9A', profile: '\uD83D\uDCCA' }[kind]);
      return r;
    });
    if (CONFIG.aiEndpoint) {
      return aiReply(text).catch(function () { return localReply(text); });
    }
    return Promise.resolve(localReply(text));
  }

  /* ------------------------------------------------------------------ *
   * Public API (also lets you test the engine without a browser)
   * ------------------------------------------------------------------ */
  var engine = { knowledge: KNOWLEDGE, findAnswer: findAnswer, localReply: localReply, personalKind: personalKind, norm: norm, buildSystemPrompt: buildSystemPrompt };
  root.WorthwiseChatbot = { engine: engine, config: CONFIG, systemPrompt: buildSystemPrompt };

  /* ------------------------------------------------------------------ *
   * UI (only runs in a browser)
   * ------------------------------------------------------------------ */
  if (typeof document === 'undefined') return;

  var els = {};
  var isOpen = false, busy = false;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // tiny, safe markdown: **bold**, *italic*, "- " bullets, blank-line paragraphs
  function format(text) {
    var s = esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    var out = [], inList = false;
    s.split('\n').forEach(function (line) {
      if (/^\s*[-\u2022]\s+/.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + line.replace(/^\s*[-\u2022]\s+/, '') + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        if (line.trim()) out.push('<p>' + line + '</p>');
      }
    });
    if (inList) out.push('</ul>');
    return out.join('');
  }

  var LOGO_SVG = '<svg viewBox="0 0 26 26" fill="none" aria-hidden="true"><rect x="1" y="6" width="24" height="17" rx="4" fill="#2FD196"/><path d="M1 10.5C1 8.01 3.01 6 5.5 6H21c2.21 0 4 1.79 4 4v1H1v-.5Z" fill="#1B9E75"/><circle cx="18.5" cy="14.5" r="3.1" fill="#0A0C0F"/><path d="M17 14.6l1.1 1.1 2-2.2" stroke="#2FD196" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  // Cute chibi robot mascot used as the launcher
  var ROBOT_SVG =
    '<svg class="wwc-robot" viewBox="0 -8 80 104" fill="none" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<linearGradient id="wwc-gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7BA0FF"/><stop offset="1" stop-color="#3F69E8"/></linearGradient>' +
        '<linearGradient id="wwc-gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E88F7"/><stop offset="1" stop-color="#3558D0"/></linearGradient>' +
      '</defs>' +
      '<ellipse class="wwc-shadow" cx="40" cy="92" rx="17" ry="3.2" fill="#000" opacity=".45"/>' +
      '<g class="wwc-float">' +
        /* feet */
        '<ellipse cx="33" cy="85" rx="6" ry="4.2" fill="#2F55C9"/><ellipse cx="47" cy="85" rx="6" ry="4.2" fill="#2F55C9"/>' +
        /* body + belly terminal */
        '<ellipse cx="40" cy="69" rx="15" ry="15" fill="url(#wwc-gb)"/>' +
        '<ellipse cx="33" cy="60.5" rx="4" ry="2" fill="#fff" opacity=".25"/>' +
        '<rect x="32.5" y="64" width="15" height="10" rx="3.5" fill="#0E1330"/>' +
        '<path d="M35.5 66.4l3 2.6-3 2.6" stroke="#7EF0FF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path class="wwc-cursor" d="M41 71.6h4.5" stroke="#7EF0FF" stroke-width="1.5" stroke-linecap="round"/>' +
        /* antenna */
        '<path d="M40 9V1.5" stroke="#2F55C9" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="40" cy="-1.5" r="6.5" fill="#FFD24D" opacity=".22"/>' +
        '<circle class="wwc-ball" cx="40" cy="-1.5" r="3.6" fill="#FFD24D"/>' +
        /* ears + head */
        '<ellipse cx="7.5" cy="31" rx="5" ry="7" fill="#2F55C9"/><ellipse cx="72.5" cy="31" rx="5" ry="7" fill="#2F55C9"/>' +
        '<rect x="9" y="8" width="62" height="46" rx="23" fill="url(#wwc-gh)"/>' +
        '<ellipse cx="26" cy="13.5" rx="9" ry="3" fill="#fff" opacity=".4"/>' +
        /* screen + blush */
        '<rect x="15" y="15" width="50" height="33" rx="15" fill="#0E1330" stroke="#1C2552" stroke-width="1"/>' +
        /* face */
        '<g class="wwc-face">' +
          '<g class="wwc-eyes"><ellipse cx="30.5" cy="29" rx="4" ry="5.2" fill="#7EF0FF"/><ellipse cx="49.5" cy="29" rx="4" ry="5.2" fill="#7EF0FF"/>' +
            '<circle cx="31.8" cy="27" r="1.4" fill="#fff"/><circle cx="50.8" cy="27" r="1.4" fill="#fff"/></g>' +
          '<g class="wwc-happy" stroke="#7EF0FF" stroke-width="2.6" stroke-linecap="round"><path d="M26 31q4.5-8 9 0"/><path d="M45 31q4.5-8 9 0"/></g>' +
          '<path d="M35 37.5q5 5 10 0" stroke="#7EF0FF" stroke-width="2.4" stroke-linecap="round"/>' +
        '</g>' +
        /* typing dots (while the bot is answering) */
        '<g class="wwc-dots" fill="#7EF0FF"><circle cx="31" cy="32" r="2.8"/><circle cx="40" cy="32" r="2.8"/><circle cx="49" cy="32" r="2.8"/></g>' +
        /* arms (mittens) */
        '<g class="wwc-arm-l"><ellipse cx="23.5" cy="70" rx="4.6" ry="7.5" fill="url(#wwc-gb)"/><circle cx="23.5" cy="76.5" r="4.4" fill="#86A9FF"/></g>' +
        '<g class="wwc-arm-r"><ellipse cx="56.5" cy="70" rx="4.6" ry="7.5" fill="url(#wwc-gb)"/><circle cx="56.5" cy="76.5" r="4.4" fill="#86A9FF"/></g>' +
      '</g>' +
    '</svg>';

  function build() {
    var wrap = document.createElement('div');
    wrap.id = 'wwc-root';
    wrap.innerHTML =
      '<button type="button" id="wwc-fab" class="wwc-fab" aria-label="Open ' + esc(CONFIG.name) + '" aria-expanded="false" aria-controls="wwc-panel">' + ROBOT_SVG + '</button>' +
      '<div id="wwc-pop" class="wwc-pop" role="status" aria-live="polite"></div>' +
      '<section id="wwc-panel" class="wwc-panel" role="dialog" aria-label="' + esc(CONFIG.name) + '" aria-hidden="true">' +
        '<header class="wwc-head">' +
          '<div class="wwc-title"><span class="wwc-avatar">' + LOGO_SVG + '</span><div><b>' + esc(CONFIG.name) + '</b><small>Ask anything about Worthwise</small></div></div>' +
          '<div class="wwc-head-btns">' +
            '<button type="button" id="wwc-clear" class="wwc-icon-btn" aria-label="Clear chat" title="Clear chat">\u21BA</button>' +
            '<button type="button" id="wwc-close" class="wwc-icon-btn" aria-label="Close chat">\u2715</button>' +
          '</div>' +
        '</header>' +
        '<div id="wwc-log" class="wwc-log" role="log" aria-live="polite"></div>' +
        '<div id="wwc-chips" class="wwc-chips" aria-label="Suggested questions"></div>' +
        '<form id="wwc-form" class="wwc-form" autocomplete="off">' +
          '<input id="wwc-input" class="wwc-input" type="text" maxlength="300" placeholder="Type your question..." aria-label="Type your question">' +
          '<button type="submit" id="wwc-send" class="wwc-send" aria-label="Send message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/></svg></button>' +
        '</form>' +
        '<div class="wwc-note">Built-in guide. Not financial advice.</div>' +
      '</section>';
    document.body.appendChild(wrap);

    ['fab', 'pop', 'panel', 'log', 'chips', 'form', 'input', 'send', 'close', 'clear'].forEach(function (id) {
      els[id] = document.getElementById('wwc-' + id);
    });
  }

  function scrollDown() { els.log.scrollTop = els.log.scrollHeight; }

  function addMessage(role, text, actions, save) {
    var row = document.createElement('div');
    row.className = 'wwc-row ' + (role === 'user' ? 'wwc-user' : 'wwc-bot');
    var bubble = document.createElement('div');
    bubble.className = 'wwc-bubble';
    bubble.innerHTML = role === 'user' ? '<p>' + esc(text) + '</p>' : format(text);

    if (role === 'bot' && actions && actions.length) {
      var box = document.createElement('div');
      box.className = 'wwc-actions';
      actions.forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wwc-action';
        b.textContent = a.label;
        b.addEventListener('click', function () { runAction(a); });
        box.appendChild(b);
      });
      bubble.appendChild(box);
    }
    row.appendChild(bubble);
    els.log.appendChild(row);
    scrollDown();

    if (save !== false) {
      history.push({ role: role, text: text, actions: actions || [], ts: Date.now() });
      if (history.length > CONFIG.maxMessages) history = history.slice(-CONFIG.maxMessages);
      persist();
    }
  }

  function runAction(a) {
    if (a.demo) {
      var demoBtn = document.querySelector('[data-try-demo]');
      if (demoBtn) { demoBtn.click(); closePanel(); return; }
      if (a.hash) window.location.hash = a.hash; else window.location.hash = '#/auth';
      closePanel();
      return;
    }
    if (a.hash) {
      window.location.hash = a.hash;
      if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) closePanel();
    }
  }

  function showTyping() {
    var row = document.createElement('div');
    row.className = 'wwc-row wwc-bot wwc-typing';
    row.id = 'wwc-typing';
    row.innerHTML = '<div class="wwc-bubble" aria-label="Assistant is typing"><span class="wwc-dot"></span><span class="wwc-dot"></span><span class="wwc-dot"></span></div>';
    els.log.appendChild(row);
    scrollDown();
  }
  function hideTyping() {
    var t = document.getElementById('wwc-typing');
    if (t) t.remove();
  }

  /* ---------- robot popup + "typing" state ---------- */
  var popTimer = null;

  function hidePop() {
    clearTimeout(popTimer);
    els.pop.classList.remove('wwc-pop-show');
  }
  // showPop('typing') shows animated dots; showPop('text', ms) shows text then hides itself;
  // showPop('<html>', ms, true) renders trusted static markup (used for the greeting only)
  function showPop(content, ms, isHtml) {
    if (isOpen) return;                       // inside the open panel the normal typing bubble is used
    clearTimeout(popTimer);
    if (content === 'typing') {
      els.pop.innerHTML = '<div class="wwc-pop-typing" aria-label="Typing"><span class="wwc-dot"></span><span class="wwc-dot"></span><span class="wwc-dot"></span></div>';
    } else if (isHtml) {
      els.pop.innerHTML = content;
    } else {
      els.pop.textContent = content;
    }
    els.pop.classList.add('wwc-pop-show');
    if (ms) popTimer = setTimeout(hidePop, ms);
  }
  function setWave(on) {
    els.fab.classList.toggle('wwc-waving', !!on);
  }
  function setThinking(on) {
    els.fab.classList.toggle('wwc-thinking', !!on);
    if (on) setWave(false);
  }
  function preview(text) {
    var t = String(text).replace(/\*\*/g, '').replace(/\n+/g, ' ').replace(/\s*-\s+/g, ' ').trim();
    var m = t.match(/^.*?[.!?](?=\s|$)/);
    var first = m ? m[0] : t;
    return first.length > 90 ? first.slice(0, 87).trim() + '...' : first;
  }
  var greetTimer = null, waveTimer = null;
  var GREETING_HTML = 'Hello! Can I help you? <span class="wwc-hand">\uD83D\uDC4B</span>';

  // robot raises its hand and a small bubble says hello
  function greetOnce() {
    if (isOpen || busy || els.pop.classList.contains('wwc-pop-show')) return;
    setWave(true);
    showPop(GREETING_HTML, 5200, true);
    clearTimeout(waveTimer);
    waveTimer = setTimeout(function () { setWave(false); }, 5200);
  }
  function startGreetLoop() {
    var tries = 0;
    (function wait() {
      // let Worthwise's own "Waking up" screen finish first
      if (document.getElementById('wake-overlay') && tries++ < 40) { setTimeout(wait, 1000); return; }
      setTimeout(function () {
        greetOnce();
        clearInterval(greetTimer);
        greetTimer = setInterval(greetOnce, Math.max(5000, Number(CONFIG.greetEveryMs) || 19000));
      }, 2500);
    })();
  }

  function setChips(list) {
    els.chips.innerHTML = '';
    (list && list.length ? list : DEFAULT_CHIPS).forEach(function (q) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'wwc-chip';
      c.textContent = q;
      c.addEventListener('click', function () { ask(q); });
      els.chips.appendChild(c);
    });
    els.chips.scrollLeft = 0;
  }

  function ask(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true;
    els.send.disabled = true;
    els.input.value = '';
    addMessage('user', text, null);
    showTyping();
    setThinking(true);
    showPop('typing');

    var started = Date.now();
    var minDelay = 1000;   // ~1 second so it feels like the bot is thinking

    respond(text).then(function (reply) {
      var wait = Math.max(0, minDelay - (Date.now() - started));
      setTimeout(function () {
        hideTyping();
        addMessage('bot', reply.text, reply.actions);
        setChips(reply.next);
        setThinking(false);
        if (!isOpen) showPop(preview(reply.text), 7000);
        busy = false;
        els.send.disabled = false;
        if (isOpen && !(window.matchMedia && window.matchMedia('(max-width: 900px)').matches)) els.input.focus();
      }, wait);
    });
  }

  /* ---------- persistence (per tab) ---------- */
  function persist() {
    try { sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(history)); } catch (e) {}
  }
  function restore() {
    try {
      var raw = sessionStorage.getItem(CONFIG.storageKey);
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!Array.isArray(saved) || !saved.length) return false;
      saved.forEach(function (m) { addMessage(m.role, m.text, m.actions, false); history.push(m); });
      return true;
    } catch (e) { return false; }
  }

  function greet() {
    var hello = "\uD83D\uDC4B " + (KNOWLEDGE[0].a) + "\n\nWhen you are logged in, you can also ask about your own numbers, like \"show my financial health\".";
    addMessage('bot', hello, null);
    setChips(KNOWLEDGE[0].next.concat(['Show my financial health']));
  }

  /* ---------- open / close ---------- */
  function openPanel() {
    isOpen = true;
    els.panel.classList.add('wwc-show');
    els.panel.setAttribute('aria-hidden', 'false');
    els.fab.classList.add('wwc-open');
    els.fab.setAttribute('aria-expanded', 'true');
    els.fab.setAttribute('aria-label', 'Close ' + CONFIG.name);
    hidePop();
    setWave(false);
    scrollDown();
    if (!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches)) els.input.focus();
  }
  function closePanel() {
    isOpen = false;
    els.panel.classList.remove('wwc-show');
    els.panel.setAttribute('aria-hidden', 'true');
    els.fab.classList.remove('wwc-open');
    els.fab.setAttribute('aria-expanded', 'false');
    els.fab.setAttribute('aria-label', 'Open ' + CONFIG.name);
    if (busy) showPop('typing');
  }

  function init() {
    if (document.getElementById('wwc-root')) return;
    build();

    if (!restore()) greet(); else setChips();

    els.fab.addEventListener('click', function () { isOpen ? closePanel() : openPanel(); });
    els.close.addEventListener('click', closePanel);
    els.pop.addEventListener('click', openPanel);
    els.clear.addEventListener('click', function () {
      history = [];
      persist();
      els.log.innerHTML = '';
      greet();
    });
    els.form.addEventListener('submit', function (e) { e.preventDefault(); ask(els.input.value); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closePanel(); });

    startGreetLoop();

    root.WorthwiseChatbot.open = openPanel;
    root.WorthwiseChatbot.close = closePanel;
    root.WorthwiseChatbot.greet = greetOnce;
    root.WorthwiseChatbot.ask = function (q) { openPanel(); ask(q); };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);