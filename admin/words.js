/*global systemDictionary:true */
'use strict';

systemDictionary = {
	'(without prefix)': {
		'en': '(without prefix)',
		'de': '(ohne Präfix)',
		'ru': '(без префикса)',
		'pt': '(sem prefixo)',
		'nl': '(zonder voorvoegsel)',
		'fr': '(sans préfixe)',
		'it': '(senza prefisso)',
		'es': '(sin prefijo)'
	},
	'Client ID': {                                   'en': 'Client ID',                                       'de': 'Client ID',                                       'ru': 'ID клиента',                                      'pt': 'ID do Cliente',                                   'nl': 'klant identificatie',                             'fr': 'identité du client',                              'it': 'Identificativo cliente',                          'es': 'Identificación del cliente'},
	'MQTT-client adapter settings': {                'en': 'MQTT-client adapter settings',                    'de': 'MQTT-client Adapter Einstellungen',               'ru': 'Настройки драйвера MQTT-клиента',                 'pt': 'Configurações do adaptador do cliente MQTT',      'nl': 'MQTT-client adapterinstellingen',                 'fr': 'MQTT-paramètres de la carte client',              'it': "Impostazioni dell'adattatore client MQTT",        'es': 'Configuraciones del adaptador MQTT-cliente'},
	'Prefix for topics': {                           'en': 'Prefix for topics',                               'de': 'Prefix für alle Topics',                          'ru': 'Префикс для всех значений',                       'pt': 'Prefixo para tópicos',                            'nl': 'Voorvoegsel voor onderwerpen',                    'fr': 'Préfixe pour les sujets',                         'it': 'Prefisso per argomenti',                          'es': 'Prefijo para temas'},
	'Server settings': {                             'en': 'Server settings',                                 'de': 'Server Einstellungen',                            'ru': 'Настройки сервера',                               'pt': 'Configurações do servidor',                       'nl': 'Server instellingen',                             'fr': 'Paramètres du serveur',                           'it': 'Impostazioni del server',                         'es': 'Configuración del servidor'},
	'additional subscriptions': {                    'en': 'Additional subscriptions',                        'de': 'Zusätzliche subscriptions',                       'ru': 'Дополнительные подписки',                         'pt': 'assinaturas adicionais',                          'nl': 'extra abonnementen',                              'fr': 'abonnements supplémentaires',                     'it': 'iscrizioni aggiuntive',                           'es': 'suscripciones adicionales'},
	'host': {                                        'en': 'MQTT Broker IP',                                  'de': 'MQTT Broker IP',                                  'ru': 'MQTT Broker IP',                                  'pt': 'hospedeiro',                                      'nl': 'gastheer',                                        'fr': 'hôte',                                            'it': 'ospite',                                          'es': 'anfitrión'},
	'last will message': {                           'en': 'Last will message',                               'de': 'last will message',                               'ru': 'last will message',                               'pt': 'last will message',                               'nl': 'last will message',                               'fr': 'last will message',                               'it': 'last will message',                               'es': 'last will message'},
	'last will topic': {                             'en': 'Last will topic',                                 'de': 'last will topic',                                 'ru': 'last will topic',                                 'pt': 'last will topic',                                 'nl': 'last will topic',                                 'fr': 'last will topic',                                 'it': 'last will topic',                                 'es': 'last will topic'},
	'must be unique': {                              'en': 'must be unique',                                  'de': 'muss einmalig sein',                              'ru': 'должно быть уникальным',                          'pt': 'deve ser único',                                  'nl': 'moet uniek zijn',                                 'fr': 'doit être unique',                                'it': 'deve essere unico',                               'es': 'debe ser único'},
	'note': {                                        'en': 'MQTT-client settings must be done for every state individually', 'de': 'MQTT-client Einstellungen müssen für jeden State einzeln gemacht werden', 'ru': 'Настройки MQTT-клиента должны выполняться для каждого состояния отдельно', 'pt': 'As configurações do cliente MQTT devem ser feitas para cada estado individualmente', 'nl': 'MQTT-clientinstellingen moeten voor elke status afzonderlijk worden uitgevoerd', 'fr': 'Les paramètres du client MQTT doivent être définis pour chaque état individuellement', 'it': 'Le impostazioni del client MQTT devono essere eseguite singolarmente per ogni stato', 'es': 'La configuración del cliente MQTT se debe realizar para cada estado individualmente'},
	'on connect message': {                          'en': 'On connect message',                              'de': 'Meldung bei Verbindung',                          'ru': 'Сообщение при подключении',                       'pt': 'na mensagem conectar',                            'nl': 'bij verbinden bericht',                           'fr': 'sur le message de connexion',                     'it': 'sul messaggio di connessione',                    'es': 'en conectar mensaje'},
	'on connect topic': {                            'en': 'On connect topic',                                'de': 'Topic bei Verbindung',                            'ru': 'Топик при подключении',                           'pt': 'no tópico de conexão',                            'nl': 'bij connect topic',                               'fr': 'sur le sujet de connexion',                       'it': 'su argomento di connessione',                     'es': 'sobre el tema de conexión'},
	'password': {                                    'en': 'Password',                                        'de': 'Kennwort',                                        'ru': 'Пароль',                                          'pt': 'senha',                                           'nl': 'wachtwoord',                                      'fr': 'mot de passe',                                    'it': "parola d'ordine",                                 'es': 'contraseña'},
	'port': {                                        'en': 'Port',                                            'de': 'Port',                                            'ru': 'Порт',                                            'pt': 'Porta',                                           'nl': 'haven',                                           'fr': 'Port',                                            'it': 'Porta',                                           'es': 'Puerto'},
	'prefix for publishing topics': {                'en': 'Prefix for publishing topics',                    'de': 'Prefix for publishing topics',                    'ru': 'Префикс для публикации тем',                      'pt': 'prefixo para publicar tópicos',                   'nl': 'voorvoegsel voor het publiceren van onderwerpen', 'fr': 'préfixe pour les sujets de publication',          'it': 'prefisso per argomenti di pubblicazione',         'es': 'prefijo para publicar temas'},
	'prefix for subscribing topics': {               'en': 'Prefix for subscribing topics',                   'de': 'Prefix for subscribing topics',                   'ru': 'Префикс для подписки на темы',                    'pt': 'prefixo para subscrever tópicos',                 'nl': 'voorvoegsel voor abonnementsonderwerpen',         'fr': 'préfixe pour les sujets abonnés',                 'it': 'prefisso per gli argomenti di iscrizione',        'es': 'prefijo para suscribirse a los temas'},
	'ssl': {                                         'en': 'SSL',                                             'de': 'SSL',                                             'ru': 'SSL',                                             'pt': 'SSL',                                             'nl': 'SSL',                                             'fr': 'SSL',                                             'it': 'SSL',                                             'es': 'SSL'},
	'username': {                                    'en': 'User name',                                       'de': 'Benutzername',                                    'ru': 'Имя пользователя',                                'pt': 'nome de usuário',                                 'nl': 'gebruikersnaam',                                  'fr': "Nom d'utilisateur",                               'it': 'nome utente',                                     'es': 'usuario'},
};