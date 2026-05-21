## Diagnose

Je hebt gelijk: mijn test was een false positive. De API-verificatie keek alleen of `object_story_spec.instagram_user_id` op de creative stond. Meta accepteert dat veld, maar Ads Manager gebruikt voor de Identity-sectie óók de ad-level Instagram identity. Daardoor kan de creative technisch een IG-id bevatten terwijl de UI alsnog “Use Facebook Page” toont en de advertentie ongeldig blijft voor Instagram.

Wat ik nu in de data zie:

- Voor Rivas staat opgeslagen: `meta_instagram_account_id = 1646842048691596`.
- De discovery vindt momenteel maar één profiel, met bron `page_backed_instagram_accounts` en business ID `17841404254570727`.
- Dat is waarschijnlijk een Page-backed Instagram Account: een soort shadow/proxy account, niet per se het echte gekoppelde Instagram-profiel dat Ads Manager in de dropdown wil selecteren.
- De huidige code paart de handmatige actor ID `1646842048691596` met die PBIA `17841404254570727` zonder hard bewijs dat dit hetzelfde profiel is.
- Vervolgens zet de upload vooral de `1784...` ID op de creative. Meta’s API accepteert dat, maar Ads Manager zet de echte Instagram profile selector niet automatisch goed.

Kort gezegd: Facebook Page koppelen lukt omdat we page access hebben. Instagram lukt niet automatisch omdat we óf de verkeerde Instagram asset gebruiken, óf niet de ad-level identity-ID meesturen die Ads Manager nodig heeft.

## Oplossingsplan

1. **Stop met valse ID-pairing**
   - Geen handmatige actor ID meer koppelen aan de enige gevonden PBIA alsof het bewezen hetzelfde profiel is.
   - Als alleen `page_backed_instagram_accounts` wordt gevonden, tonen/loggen we dat expliciet als fallback, niet als “echt gekoppeld profiel”.

2. **Instagram discovery uitbreiden naar Business Manager assets**
   - Haal business/ad-account context op via het ad account.
   - Zoek Instagram-profielen via business-level endpoints zoals business Instagram accounts, client Instagram accounts en owned Instagram assets waar beschikbaar.
   - Gebruik page-connected endpoints alleen als harde match wanneer Meta zelf `instagram_business_account`, `connected_instagram_account` of `/page/instagram_accounts` teruggeeft.

3. **Ad-level identity correct opbouwen**
   - Splits de IDs bewust:
     - de echte Ads Manager identity / actor ID voor het ad-level veld;
     - de moderne IG account ID voor `object_story_spec.instagram_user_id` waar Meta dat vereist.
   - Niet alleen `object_story_spec` verifiëren, maar ook het creatieve top-level identity field dat Ads Manager gebruikt.

4. **Creatie laten falen als Meta geen echte Instagram identity heeft**
   - Als we alleen een PBIA/shadow account vinden en geen echt gekoppeld/assigned Instagram-profiel, dan geen “success” meer tonen.
   - De foutmelding moet dan zeggen dat het Instagram-profiel in Meta Business aan hetzelfde ad account en dezelfde Page moet zijn toegewezen.

5. **Verificatie aanscherpen met Ads Manager-realiteit**
   - Na creatie de ad creative teruglezen met zowel `object_story_spec.instagram_user_id` als top-level `instagram_user_id`/identity fields.
   - Alleen success opslaan wanneer de ad-level identity overeenkomt met het gekozen profiel.

## Verwachte uitkomst

Na deze wijziging is er geen schijnsucces meer. Of de advertentie wordt aangemaakt met het profiel dat Ads Manager ook echt selecteert, of de app geeft direct aan dat Meta het echte Instagram-profiel niet beschikbaar maakt voor dit ad account/page-paar.