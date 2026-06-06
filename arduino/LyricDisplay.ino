/*
 * Arduino LCD Lyric Display
 *
 * Lyrics scroll automatically on boot. Edit holdMs to change speed.
 * LCD: RS=12, EN=11, D4-D7=5,4,3,2
 */

#include <LiquidCrystal.h>

LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

struct Lyric {
  char line1[17];
  char line2[17];
  unsigned long holdMs;
};

Lyric lyrics[] = {
  {"On the highway  ", "and I'm thinkin'", 3000},
  {"that I love her ", "                ", 3000},
};

const int LYRIC_COUNT = sizeof(lyrics) / sizeof(lyrics[0]);

int currentPage = 0;
unsigned long lastChange = 0;

void showPage(int index) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(lyrics[index].line1);
  lcd.setCursor(0, 1);
  lcd.print(lyrics[index].line2);
}

void setup() {
  lcd.begin(16, 2);
  showPage(0);
  lastChange = millis();
}

void loop() {
  if (millis() - lastChange >= lyrics[currentPage].holdMs) {
    currentPage = (currentPage + 1) % LYRIC_COUNT;
    showPage(currentPage);
    lastChange = millis();
  }
}
