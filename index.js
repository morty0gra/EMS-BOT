const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');

// ================= USTAWIENIA =================
const BOT_TOKEN = process.env.BOT_TOKEN; 
const PORT = process.env.PORT || 3000;
// ==============================================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();

// Zwiększamy limit danych, bo będziemy przesyłać gotowe zdjęcie w Base64
app.use(cors());
app.use(express.json({ limit: '10mb' })); 

// Baza danych
const CONFIG_FILE = './config.json';
let channelsConfig = { podania: null, wyniki: null, aktZgonu: null };
if (fs.existsSync(CONFIG_FILE)) { channelsConfig = JSON.parse(fs.readFileSync(CONFIG_FILE)); } 
else { fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig)); }

const KONTA_FILE = './konta.json';
let kontaConfig = {};
if (fs.existsSync(KONTA_FILE)) { kontaConfig = JSON.parse(fs.readFileSync(KONTA_FILE)); } 
else { kontaConfig = { "Zarzad": "EMS123" }; fs.writeFileSync(KONTA_FILE, JSON.stringify(kontaConfig)); }

// --- API 1: PODAŃ ---
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
    } catch (e) { res.status(500).send({ error: 'Błąd serwera' }); }
});

// --- API 2: LOGOWANIE ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (kontaConfig[username] && kontaConfig[username] === password) res.status(200).send({ success: true });
    else res.status(401).send({ success: false });
});

// --- API 3: AKT ZGONU (ODBIERANIE GOTOWEGO ZDJĘCIA ZE STRONY WWW) ---
app.post('/api/akt-zgonu', async (req, res) => {
    try {
        if (!channelsConfig.aktZgonu) return res.status(400).send({ error: 'Brak kanału!' });
        
        const data = req.body; // Odbieramy dane ze strony
        
        // Magia: Przerabiamy kod Base64 (zdjęcie ze strony) na prawdziwy plik PNG
        const imageBuffer = Buffer.from(data.imageBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
        const attachment = new AttachmentBuilder(imageBuffer, { name: `${data.sygnatura}.png` });

        const embed = new EmbedBuilder()
            .setTitle(`📜 Wystawiono Nowy Akt Zgonu: ${data.sygnatura}`)
            .setDescription(`**Zmarły:** ${data.imie} ${data.nazwisko}\n**Lekarz Wystawiający:** ${data.lekarz}`)
            .setColor(0x000000)
            .setImage(`attachment://${data.sygnatura}.png`) // Wklejamy zrobiony screen do wiadomości
            .setTimestamp();

        const kanal = await client.channels.fetch(channelsConfig.aktZgonu);
        await kanal.send({ embeds: [embed], files: [attachment] });

        res.status(200).send({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Błąd po stronie bota' });
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'podania') {
        if (!interaction.memberPermissions.has('Administrator')) return interaction.reply({ content: 'Brak uprawnień.', ephemeral: true });
        channelsConfig.podania = interaction.options.getChannel('kanal_podan').id;
        channelsConfig.wyniki = interaction.options.getChannel('kanal_wynikow').id;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));
        await interaction.reply({ content: `✅ Kanały skonfigurowane pomyślnie!`, ephemeral: true });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'ustawaktzgonu') {
        if (!interaction.memberPermissions.has('Administrator')) return interaction.reply({ content: 'Brak uprawnień.', ephemeral: true });
        channelsConfig.aktZgonu = interaction.options.getChannel('kanal_aktu').id;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));
        await interaction.reply({ content: `✅ Akty Zgonu będą wysyłane na <#${channelsConfig.aktZgonu}>!`, ephemeral: true });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'konto') {
        if (!interaction.memberPermissions.has('Administrator')) return interaction.reply({ content: 'Brak uprawnień.', ephemeral: true });
        const subCmd = interaction.options.getSubcommand();
        if (subCmd === 'dodaj') {
            const login = interaction.options.getString('login');
            const haslo = interaction.options.getString('haslo');
            kontaConfig[login] = haslo;
            fs.writeFileSync(KONTA_FILE, JSON.stringify(kontaConfig));
            await interaction.reply({ content: `✅ Utworzono konto.\n**Login:** ${login}\n**Hasło:** ${haslo}`, ephemeral: true });
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

    if (interaction.isButton()) {
        const [action, discordNick] = interaction.customId.split('_');
        if (action === 'done') return; 
        if (!channelsConfig.wyniki) return interaction.reply({ content: 'Ustaw kanał wyników!', ephemeral: true });
        const wynikiChannel = await client.channels.fetch(channelsConfig.wyniki);
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('done_accept').setLabel(action === 'accept' ? 'ZAAKCEPTOWANE' : 'ZAAKCEPTUJ').setStyle(action === 'accept' ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('done_reject').setLabel(action === 'reject' ? 'ODRZUCONE' : 'ODRZUĆ').setStyle(action === 'reject' ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(true),
        );
        await interaction.update({ components: [disabledRow] });
        const resultEmbed = new EmbedBuilder()
            .setTitle('🩺 DECYZJA REKRUTACYJNA EMS')
            .setDescription(`Podanie gracza: **${discordNick}** zostało rozpatrzone.`)
            .addFields({ name: 'Status:', value: action === 'accept' ? '✅ **ZAAKCEPTOWANE**' : '❌ **ODRZUCONE**' }, { name: 'Rozpatrzył:', value: `<@${interaction.user.id}>` })
            .setColor(action === 'accept' ? 0x10b981 : 0xef4444);
        await wynikiChannel.send({ embeds: [resultEmbed] });
    }
});

client.once('ready', async () => {
    console.log(`Bot zalogowany jako ${client.user.tag}`);
    const commands = [
        { name: 'podania', description: 'Konfiguracja kanałów', options: [{ name: 'kanal_podan', type: 7, description: 'Kanał', required: true }, { name: 'kanal_wynikow', type: 7, description: 'Kanał', required: true }] },
        { name: 'ustawaktzgonu', description: 'Ustaw kanał Aktów Zgonu', options: [{ name: 'kanal_aktu', type: 7, description: 'Kanał', required: true }] },
        { name: 'konto', description: 'Zarządzanie kontami', options: [
            { name: 'dodaj', type: 1, description: 'Nowe konto', options: [{ name: 'login', type: 3, description: 'Login', required: true }, { name: 'haslo', type: 3, description: 'Hasło', required: true }] },
            { name: 'usun', type: 1, description: 'Usuń konto', options: [{ name: 'login', type: 3, description: 'Login', required: true }] },
            { name: 'lista', type: 1, description: 'Lista kont' }
        ]}
    ];
    await client.application.commands.set(commands);
});

app.listen(PORT, () => { client.login(BOT_TOKEN); });
