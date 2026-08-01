export const REFERENCE_SOURCE = Object.freeze({
  label: "D&D 5e SRD 5.1 italiano",
  url: "https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1_IT.pdf",
  license: "CC BY 4.0",
});

export const CONDITION_REFERENCE = Object.freeze([
  {
    name: "Accecato",
    summary: "La creatura non è in grado di vedere.",
    details: "• Una creatura accecata non è in grado di vedere e fallisce automaticamente qualsiasi prova di caratteristica che richieda l'uso della vista.\n• I tiri per colpire contro la creatura dispongono di vantaggio, mentre i tiri per colpire della creatura subiscono svantaggio.",
  },
  {
    name: "Affascinato",
    summary: "La creatura è soggetta al fascino di un'altra creatura.",
    details: "• Una creatura affascinata non può attaccare chi l'ha affascinata né bersagliarlo con capacità o effetti magici dannosi.\n• Chi ha affascinato la creatura dispone di vantaggio a qualsiasi prova di caratteristica effettuata per interagire socialmente con essa.",
  },
  {
    name: "Afferrato",
    summary: "La velocità della creatura diventa 0.",
    details: "• La velocità di una creatura afferrata diventa 0 e la creatura non può beneficiare di alcun bonus alla velocità.\n• La condizione termina se chi ha afferrato la creatura è incapacitato (vedi la relativa condizione).\n• La condizione termina anche se un effetto rimuove la creatura afferrata dalla portata di chi l'ha afferrata o dell'effetto afferrante, come per esempio se viene scagliata lontano dall'incantesimo onda tonante.",
  },
  {
    name: "Assordato",
    summary: "La creatura non è in grado di sentire.",
    details: "• Una creatura assordata non è in grado di sentire e fallisce automaticamente qualsiasi prova di caratteristica che richieda l'uso dell'udito.",
  },
  {
    name: "Avvelenato",
    summary: "La creatura subisce svantaggio ai tiri per colpire e alle prove.",
    details: "• Una creatura avvelenata subisce svantaggio ai tiri per colpire e alle prove di caratteristica.",
  },
  {
    name: "Incapacitato",
    summary: "La creatura non può effettuare azioni o reazioni.",
    details: "• Una creatura incapacitata non può effettuare azioni o reazioni.",
  },
  {
    name: "Indebolimento",
    summary: "Sei livelli cumulativi, fino alla morte.",
    details: "Alcune capacità speciali e pericoli ambientali, come l'inedia e gli effetti a lungo termine di temperature gelide o torride, possono indurre una condizione speciale chiamata indebolimento. L'indebolimento è misurato in sei livelli. Un effetto può indurre nella creatura uno o più livelli di indebolimento, come specificato nella sua descrizione.\n\nLivello | Effetto\n1 | Svantaggio alle prove di caratteristica\n2 | Velocità dimezzata\n3 | Svantaggio a tiri per colpire e tiri salvezza\n4 | Punti ferita massimi dimezzati\n5 | Velocità ridotta a 0\n6 | Morte\n\nSe una creatura già indebolita subisce un ulteriore effetto di indebolimento, il suo attuale livello di indebolimento aumenta della quantità specificata nella descrizione dell'effetto. Una creatura subisce l'effetto del suo livello di indebolimento attuale nonché quelli relativi a tutti i livelli inferiori. Per esempio, se una creatura soffre di un indebolimento di livello 2, la sua velocità è dimezzata e subisce svantaggio alle prove di caratteristica.\n\nUn effetto che rimuove l'indebolimento ne riduce il livello come indicato nella sua descrizione; inoltre, tutti gli effetti di indebolimento terminano se il livello di indebolimento di una creatura scende a meno di 1. Il livello di indebolimento di una creatura viene ridotto di 1 quando completa un riposo lungo, purché abbia anche mangiato e bevuto qualcosa.",
  },
  {
    name: "Invisibile",
    summary: "La creatura non può essere vista senza magia o sensi speciali.",
    details: "• Una creatura invisibile è impossibile da vedere senza l'aiuto della magia o di sensi speciali. Agli effetti del nascondersi, è considerata pesantemente oscurata. La sua ubicazione può essere intuita dai rumori che emette o dalle tracce che lascia.\n• I tiri per colpire contro la creatura subiscono svantaggio, mentre i tiri per colpire della creatura ottengono vantaggio.",
  },
  {
    name: "Paralizzato",
    summary: "La creatura è incapacitata e non può muoversi o parlare.",
    details: "• Una creatura paralizzata è incapacitata (vedi la relativa condizione) e non può muoversi o parlare.\n• La creatura fallisce automaticamente i tiri salvezza su Forza e Destrezza.\n• I tiri per colpire contro la creatura ottengono vantaggio.\n• Ogni attacco che colpisce la creatura è un colpo critico se l'attaccante è situato entro 1,5 metri dalla creatura.",
  },
  {
    name: "Pietrificato",
    summary: "La creatura è trasformata in una sostanza solida inanimata.",
    details: "• Una creatura pietrificata viene trasformata, assieme a ogni oggetto non magico che trasporta o indossa, in una sostanza solida inanimata (solitamente pietra). La creatura cessa di invecchiare e il suo peso viene decuplicato.\n• La creatura è incapacitata (vedi condizione), non può muoversi o parlare, né è consapevole di ciò che le accade attorno.\n• I tiri per colpire contro la creatura ottengono vantaggio.\n• La creatura fallisce automaticamente i tiri salvezza su Forza e Destrezza.\n• La creatura è dotata di resistenza a tutti i danni.\n• La creatura è immune a veleni e malattie, ma eventuali veleni o malattie già presenti nel suo sistema vengono solo sospesi, non neutralizzati.",
  },
  {
    name: "Privo di sensi",
    summary: "La creatura è incapacitata, inconsapevole e prona.",
    details: "• Una creatura priva di sensi è incapacitata (vedi la relativa condizione), non è in grado di muoversi o parlare ed è inconsapevole di ciò che le accade attorno.\n• La creatura lascia cadere tutto ciò che impugna e cade a terra prona.\n• La creatura fallisce automaticamente i tiri salvezza su Forza e Destrezza.\n• I tiri per colpire contro la creatura ottengono vantaggio.\n• Ogni attacco che colpisce la creatura è un colpo critico se l'attaccante è situato entro 1,5 metri dalla creatura.",
  },
  {
    name: "Prono",
    summary: "La creatura è a terra.",
    details: "• L'unico movimento possibile per una creatura prona è strisciare, a meno che non si rialzi in piedi.\n• La creatura subisce svantaggio ai tiri per colpire.\n• Un tiro per colpire contro la creatura ha vantaggio se l'attaccante si trova entro 1,5 metri, altrimenti subisce svantaggio.",
  },
  {
    name: "Spaventato",
    summary: "La creatura teme una fonte visibile e non può avvicinarsi volontariamente.",
    details: "• Una creatura spaventata subisce svantaggio alle prove di caratteristica e ai tiri per colpire mentre la fonte della sua paura è entro la sua linea di vista.\n• La creatura non può avvicinarsi volontariamente alla fonte della sua paura.",
  },
  {
    name: "Stordito",
    summary: "La creatura è incapacitata, non può muoversi e parla a fatica.",
    details: "• Una creatura stordita è incapacitata (vedi la relativa condizione), non può muoversi e può parlare solo a fatica.\n• La creatura fallisce automaticamente i tiri salvezza su Forza e Destrezza.\n• I tiri per colpire contro la creatura dispongono di vantaggio.",
  },
  {
    name: "Trattenuto",
    summary: "La velocità della creatura diventa 0 ed è più facile colpirla.",
    details: "• La velocità di una creatura trattenuta diventa 0 e la creatura non può beneficiare di alcun bonus alla velocità.\n• I tiri per colpire contro la creatura dispongono di vantaggio, mentre i tiri per colpire della creatura subiscono svantaggio.\n• La creatura fallisce automaticamente i tiri salvezza su Forza e Destrezza.",
  },
  {
    name: "Ira",
    summary: "Effetto personalizzato del tracker.",
    details: "Voce personalizzata del tracker per rappresentare l'ira o un effetto equivalente. Le regole precise dipendono dalla creatura o dalla capacità che l'ha applicata.",
  },
]);

export const CONDITION_REFERENCE_BY_NAME = new Map(
  CONDITION_REFERENCE.map((entry) => [entry.name, entry]),
);
