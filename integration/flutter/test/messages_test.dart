import 'package:directory_loader_consumer/l10n/app_localizations_en.dart';
import 'package:directory_loader_consumer/l10n/app_localizations_tr.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'generated consumer interpolates, pluralizes and selects both locales',
    () {
      final en = AppLocalizationsEn();
      final tr = AppLocalizationsTr();
      expect(en.home_greeting('Ada'), 'Hello Ada');
      expect(tr.home_greeting('Ada'), 'Merhaba Ada');
      expect(en.home_items(1), 'One item');
      expect(en.home_items(3), 'Many items');
      expect(tr.home_items(3), 'Öğeler');
      expect(en.home_choice('admin'), 'Administrator');
      expect(en.home_choice('other'), 'Member');
      expect(tr.home_choice('admin'), 'Yönetici');
    },
  );
}
