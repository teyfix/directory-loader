import 'package:directory_loader_consumer/l10n/app_localizations_de.dart';
import 'package:directory_loader_consumer/l10n/app_localizations_en.dart';
import 'package:directory_loader_consumer/l10n/app_localizations_tr.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'generated consumer interpolates, pluralizes and selects every locale',
    () {
      final en = AppLocalizationsEn();
      final tr = AppLocalizationsTr();
      final de = AppLocalizationsDe();
      expect(en.home_greeting('Ada'), 'Hello Ada');
      expect(tr.home_greeting('Ada'), 'Merhaba Ada');
      expect(de.home_greeting('Ada'), 'Hallo Ada');
      expect(en.home_items(1), 'One item');
      expect(en.home_items(3), 'Many items');
      expect(tr.home_items(3), 'Öğeler');
      expect(de.home_items(1), 'Ein Element');
      expect(de.home_items(3), 'Viele Elemente');
      expect(en.home_choice('admin'), 'Administrator');
      expect(en.home_choice('other'), 'Member');
      expect(tr.home_choice('admin'), 'Yönetici');
      expect(de.home_choice('other'), 'Mitglied');
    },
  );
}
