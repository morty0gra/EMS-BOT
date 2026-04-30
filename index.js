const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');

// ================= USTAWIENIA =================
const BOT_TOKEN = process.env.BOT_TOKEN; 
const PORT = process.env.PORT || 3000;
const OWNER_ID = '1111596074562494524'; // <-- TWOJE ID (God Mode)
// ==============================================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Fix dla Cron-job.org
app.get('/', (req, res) => {
    res.status(200).send('BOT EMS DZIALA POPRAWNIE! (Pinging OK)');
});

// Baza danych kanałów i uprawnień
const CONFIG_FILE = './config.json';
let channelsConfig = { podania: null, wyniki: null, aktZgonu: null, dozwoloneRangi: [] };
if (fs.existsSync(CONFIG_FILE)) { 
    channelsConfig = JSON.parse(fs.readFileSync(CONFIG_FILE)); 
    if (!channelsConfig.dozwoloneRangi) channelsConfig.dozwoloneRangi = []; // Zabezpieczenie na wypadek starego pliku
} else { 
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig)); 
}

// Baza danych kont
const KONTA_FILE = './konta.json';
let kontaConfig = {};
if (fs.existsSync(KONTA_FILE)) { kontaConfig = JSON.parse(fs.readFileSync(KONTA_FILE)); } 
else { kontaConfig = { "Zarzad": "EMS123" }; fs.writeFileSync(KONTA_FILE, JSON.stringify(kontaConfig)); }

// --- FUNKCJA SPRAWDZAJĄCA UPRAWNIENIA ---
function maUprawnienia(interaction) {
    if (interaction.user.id === OWNER_ID) return true; // Ty zawsze możesz wszystko
    if (!channelsConfig.dozwoloneRangi || channelsConfig.dozwoloneRangi.length === 0) return false; // Nikt inny, jeśli nie dodano rang
    
    // Sprawdza, czy gracz ma jedną z dozwolonych rang
    return channelsConfig.dozwoloneRangi.some(rolaId => interaction.member.roles.cache.has(rolaId));
}

// --- API 1: PODAŃ (Rekrutacja) ---
app.post('/api/apply', async (req, res) => {
    try {
        if (!channelsConfig.podania) return res.status(400).send({ error: 'Brak kanału podań!' });
        const hrChannel = await client.channels.fetch(channelsConfig.podania);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_${req.body.discordNick}`).setLabel('ZAAKCEPTUJ').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_${req.body.discordNick}`).setLabel('ODRZUĆ').setStyle(ButtonStyle.Danger),
        );
        await hrChannel.send({ embeds: req.body.embeds, components: [row] });
        res.status(200).send({ message: 'Wysłano' });
    } catch (e) { 
        console.error(e);
        res.status(500).send({ error: 'Błąd serwera' }); 
    }
});

// --- API 2: LOGOWANIE ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (kontaConfig[username] && kontaConfig[username] === password) res.status(200).send({ success: true });
    else res.status(401).send({ success: false });
});

// --- API 3: AKT ZGONU (ODBIERANIE GOTOWEGO ZDJĘCIA) ---
app.post('/api/akt-zgonu', async (req, res) => {
    try {
        if (!channelsConfig.aktZgonu) return res.status(400).send({ error: 'Brak kanału!' });
        
        const data = req.body;
        if (!data.imageBase64) return res.status(400).send({ error: 'Brak obrazu od strony WWW!' });
        
        const imageBuffer = Buffer.from(data.imageBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const attachment = new AttachmentBuilder(imageBuffer, { name: `${data.sygnatura}.png` });

        const embed = new EmbedBuilder()
            .setTitle(`📜 Wystawiono Nowy Akt Zgonu: ${data.sygnatura}`)
            .setDescription(`**Zmarły:** ${data.imie} ${data.nazwisko}\n**Lekarz Wystawiający:** ${data.lekarz}`)
            .setColor(0x000000)
            .setImage(`attachment://${data.sygnatura}.png`)
            .setTimestamp();

        const kanal = await client.channels.fetch(channelsConfig.aktZgonu);
        await kanal.send({ embeds: [embed], files: [attachment] });

        res.status(200).send({ success: true });
    } catch (error) {
        console.error("Błąd podczas wysyłania aktu:", error);
        res.status(500).send({ error: 'Błąd po stronie bota' });
    }
});

client.on('interactionCreate', async interaction => {
    // --- OBSŁUGA KOMEND (UKOŚNIKI) ---
    if (interaction.isChatInputCommand()) {
        
        // Zabezpieczenie całej bazy komend - odrzuć, jeśli to nie Ty i brak rangi
        if (!maUprawnienia(interaction)) {
            return interaction.reply({ content: '❌ **Odmowa dostępu.** Nie masz uprawnień do korzystania z tego bota.', ephemeral: true });
        }

        if (interaction.commandName === 'podania') {
            channelsConfig.podania = interaction.options.getChannel('kanal_podan').id;
            channelsConfig.wyniki = interaction.options.getChannel('kanal_wynikow').id;
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));
            await interaction.reply({ content: `✅ Kanały rekrutacji skonfigurowane pomyślnie!`, ephemeral: true });
        }

        if (interaction.commandName === 'ustawaktzgonu') {
            channelsConfig.aktZgonu = interaction.options.getChannel('kanal_aktu').id;
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));
            await interaction.reply({ content: `✅ Akty Zgonu będą wysyłane na <#${channelsConfig.aktZgonu}>!`, ephemeral: true });
        }

        if (interaction.commandName === 'uprawnienia') {
            const subCmd = interaction.options.getSubcommand();
            if (subCmd === 'dodaj') {
                const rola = interaction.options.getRole('ranga');
                if (!channelsConfig.dozwoloneRangi.includes(rola.id)) {
                    channelsConfig.dozwoloneRangi.push(rola.id);
                    fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));
                }
                await interaction.reply({ content: `✅ Ranga <@&${rola.id}> otrzymała uprawnienia do obsługi bota!`, ephemeral: true });
            }
            else if (subCmd === 'usun') {
                const rola = interaction.options.getRole('ranga');
                channelsConfig.dozwoloneRangi = channelsConfig.dozwoloneRangi.filter(id => id !== rola.id);
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));
                await interaction.reply({ content: `✅ Ranga <@&${rola.id}> straciła uprawnienia.`, ephemeral: true });
            }
            else if (subCmd === 'lista') {
                if (channelsConfig.dozwoloneRangi.length === 0) return interaction.reply({ content: 'Brak dozwolonych rang. Tylko Ty masz dostęp.', ephemeral: true });
                const lista = channelsConfig.dozwoloneRangi.map(id => `- <@&${id}>`).join('\n');
                await interaction.reply({ content: `📝 **Rangi z dostępem:**\n${lista}`, ephemeral: true });
            }
        }

        if (interaction.commandName === 'konto') {
            const subCmd = interaction.options.getSubcommand();
            if (subCmd === 'dodaj') {
                const login = interaction.options.getString('login');
                const haslo = interaction.options.getString('haslo');
                kontaConfig[login] = haslo;
                fs.writeFileSync(KONTA_FILE, JSON.stringify(kontaConfig));
                await interaction.reply({ content: `✅ Utworzono konto do bazy danych.\n**Login:** ${login}\n**Hasło:** ${haslo}`, ephemeral: true });
            }
            else if (subCmd === 'usun') {
                const login = interaction.options.getString('login');
                if (kontaConfig[login]) {
                    delete kontaConfig[login];
                    fs.writeFileSync(KONTA_FILE, JSON.stringify(kontaConfig));
                    await interaction.reply({ content: `✅ Usunięto konto: **${login}**`, ephemeral: true });
                } else { await interaction.reply({ content: `❌ Nie znaleziono konta: ${login}`, ephemeral: true }); }
            }
            else if (subCmd === 'lista') {
                const loginy = Object.keys(kontaConfig);
                if (loginy.length === 0) return interaction.reply({ content: 'Brak kont.', ephemeral: true });
                await interaction.reply({ content: `📝 **Lista kont (loginy):**\n${loginy.map(l => `- ${l}`).join('\n')}`, ephemeral: true });
            }
        }
    }

    // --- OBSŁUGA PRZYCISKÓW (ZAAKCEPTUJ / ODRZUĆ) ---
    if (interaction.isButton()) {
        
        // Nikt poza Tobą i dozwolonymi rangami nie może klikać w podania!
        if (!maUprawnienia(interaction)) {
            return interaction.reply({ content: '❌ **Odmowa dostępu.** Nie masz uprawnień do sprawdzania podań!', ephemeral: true });
        }

        const [action, discordNick] = interaction.customId.split('_');
        if (action === 'done') return; 
        if (!channelsConfig.wyniki) return interaction.reply({ content: 'Ustaw najpierw kanał wyników!', ephemeral: true });
        
        const wynikiChannel = await client.channels.fetch(channelsConfig.wyniki);
        
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('done_accept').setLabel(action === 'accept' ? 'ZAAKCEPTOWANE' : 'ZAAKCEPTUJ').setStyle(action === 'accept' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('done_reject').setLabel(action === 'reject' ? 'ODRZUCONE' : 'ODRZUĆ').setStyle(action === 'reject' ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(true),
        );
        await interaction.update({ components: [disabledRow] });
        
        const resultEmbed = new EmbedBuilder()
            .setTitle('🩺 DECYZJA REKRUTACYJNA EMS')
            .setDescription(`Podanie gracza: **${discordNick}** zostało rozpatrzone.`)
            .addFields(
                { name: 'Status:', value: action === 'accept' ? '✅ **ZAAKCEPTOWANE**' : '❌ **ODRZUCONE**' },
                { name: 'Rozpatrzył:', value: `<@${interaction.user.id}>` }
            )
            .setColor(action === 'accept' ? 0x10b981 : 0xef4444);
            
        await wynikiChannel.send({ embeds: [resultEmbed] });
    }
});

client.once('ready', async () => {
    console.log(`Bot zalogowany jako ${client.user.tag}`);
    const commands = [
        { name: 'podania', description: 'Konfiguracja kanałów (Wymagane uprawnienia)', options: [{ name: 'kanal_podan', type: 7, description: 'Kanał na podania', required: true }, { name: 'kanal_wynikow', type: 7, description: 'Kanał na wyniki', required: true }] },
        { name: 'ustawaktzgonu', description: 'Ustaw kanał Aktów Zgonu (Wymagane uprawnienia)', options: [{ name: 'kanal_aktu', type: 7, description: 'Wybierz kanał', required: true }] },
        { name: 'uprawnienia', description: 'Zarządzaj rangami, które mają dostęp do bota', options: [
            // Typ 8 oznacza w Discord API dokładnie "Wybór Rangi"
            { name: 'dodaj', type: 1, description: 'Zezwól randze na używanie bota', options: [{ name: 'ranga', type: 8, description: 'Wybierz rangę', required: true }] },
            { name: 'usun', type: 1, description: 'Zabierz randze dostęp do bota', options: [{ name: 'ranga', type: 8, description: 'Wybierz rangę', required: true }] },
            { name: 'lista', type: 1, description: 'Pokaż rangi z dostępem' }
        ]},
        { name: 'konto', description: 'Zarządzanie kontami ratowników na stronę WWW (Wymagane uprawnienia)', options: [
            { name: 'dodaj', type: 1, description: 'Nowe konto', options: [{ name: 'login', type: 3, description: 'Login', required: true }, { name: 'haslo', type: 3, description: 'Hasło', required: true }] },
            { name: 'usun', type: 1, description: 'Usuń konto', options: [{ name: 'login', type: 3, description: 'Login', required: true }] },
            { name: 'lista', type: 1, description: 'Lista kont' }
        ]}
    ];
    await client.application.commands.set(commands);
});

app.listen(PORT, () => {
    console.log(`Serwer wystartował na porcie ${PORT}`);
    client.login(BOT_TOKEN);
});
