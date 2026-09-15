/*
 * Siegel-Inhalt — DIE IDENTITÄT DIESES KNOTENS, und sonst nichts.
 *
 * ⚠ HIER STEHT KEIN KANON. Der Andock-Wizard, alle Anzeigetexte und alle
 * Prüfungen liegen seit A18 (2026-09-14) in EINER netzweit byte-gleichen
 * Datei — `sbkim/sbkim-andock-wizard.js`, Kanon `Sage-Protokol/src/modules/16b_andock_wizard.js`.
 * Diese Datei trägt nur noch, was in jedem Knoten ANDERS sein muss.
 *
 * Warum die Trennung: gemessen über die 20 Kopien im Netz standen am 2026-09-14
 * ZWÖLF verschiedene Code-Fassungen desselben Werkzeugs. Jede Verbesserung
 * kostete Handarbeit mal zwanzig und unterblieb deshalb meistens.
 *
 * ⚠ UND DIESE DATEI WIRD NIE VERTEILT. Sie trägt die BEDEUTUNG des Knotens; ein
 * Überschreiben gäbe dieser App den Namen und den Vektor einer fremden — der
 * Schaden vom 2026-08-16 in Alis Moderaum.
 *
 * Vertrag: Sage-Protokol/docs/INTERFACES.md §11.9.
 */
(function () {
  "use strict";
  window.SBKIM_SIEGEL_WIZ = {
    domain: "lausiklauskn-png.github.io",
    endpoint: "https://lausiklauskn-png.github.io/Muttis-Rezeptbuch/",
    nodeType: "hybrid",
    nodeName: "Muttis Rezeptbuch",
    domainDescription: "Muttis Rezeptbuch ist ein Endknoten im SBKIM-Mycel f\u00fcr hausgemachte Kochrezepte \u2014 von Vorspeisen, Suppen, Fleisch, Fisch und vegetarischen Gerichten \u00fcber Kuchen und Desserts bis zu Saucen und Beilagen, vom Hefeteig bis zur fertigen Sauce. Dazu passende Begleitgetr\u00e4nke (Limonaden, Tees, Mocktails, alkoholfreie Cocktails) und kleine Knabbereien als \u00dcberraschungs-Plus. Zugleich ein wandelbarer Rezept-Baukasten: nicht auf ein Thema festgelegt \u2014 lade ein neues Rezept-Paket herein, benenne Kategorien um, und aus dem Kochbuch wird deine eigene Bar (Backstube, Grill-Buch, Fr\u00fchst\u00fccksbar, Salatbar, Pasta-Werkstatt). Jedes Rezept ist Zutaten plus Schritte \u2014 bis hin zu den Zutaten eines Chemiebaukastens. Teil des SBKIM-Knotennetzes rund um Sage-Protokoll und SB-KIMTool-Point, semantisch verbunden mit verwandten Knoten wie dem Cocktail-Knoten Mixarium.",
    domainKeywords: ["Rezept", "Kochen", "Essen", "Hauptgang", "Beilage", "Backen", "Saucen"],
    stammCategories: ["Vorspeisen", "Suppen", "Fleisch", "Fisch", "Vegetarisch", "Kuchen", "Desserts"],
    guestCategories: ["Getr\u00e4nke", "Smoothies & Shakes", "Mocktails", "Alkfr. Cocktails", "Limonaden", "Tees & Kaffees", "Cocktails", "Bowlen", "Sirup & Basis", "Knabbereien", "Fingerfood"],
    backupPrefix: "muttis-rezeptbuch-backup",   // Dateiname-Pr\u00e4fix des verschl\u00fcsselten Backups
    /* ⚠ DER INHALT ENTSCHEIDET ÜBER DEN VEKTOR, wenn welcher da ist.
       Die Stichprobe selbst lebt in sbkim/sbkim-init.js — hier steht nur der
       Verweis, SPÄT aufgelöst: sbkim-init.js wird vor dieser Datei geladen,
       ein direkter Zugriff liefe also ins Leere. Zwei Fassungen derselben
       Stichprobe ergäben zwei verschiedene Vektoren für denselben Knoten. */
    sampleContent: function () {
      var f = window.SBKIM_SAMPLE_CONTENT;
      return (typeof f === "function") ? f() : [];
    },
  };
})();
