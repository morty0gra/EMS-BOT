const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');

// ================= USTAWIENIA =================
// TUTAJ WPISZ NOWY TOKEN SWOJEGO BOTA (Zakładka "Bot" -> "Reset Token")
const BOT_TOKEN = 'MTQ5ODY2MzExNzg4MDY4ODgxMA.GDrMKT.h-CUHe9guhoyfvpRhmVZVGU7CHoo1GGt5icLwE'; 
const PORT = process.env.PORT || 3000;
// ==============================================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const app = express();

app.use(cors());
app.use(express.json());

// System zapisu kanałów do pliku
const CONFIG_FILE = './config.json';
let channelsConfig = { podania: null, wyniki: null };

if (fs.existsSync(CONFIG_FILE)) {
    channelsConfig = JSON.parse(fs.readFileSync(CONFIG_FILE));
} else {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));
}

// 1. Odbieranie danych ze strony WWW
app.post('/api/apply', async (req, res) => {
    try {
        if (!channelsConfig.podania) {
            return res.status(400).send({ error: 'Zarząd jeszcze nie ustawił kanału na podania komendą /podania!' });
        }

        const podanie = req.body;
        const hrChannel = await client.channels.fetch(channelsConfig.podania);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`accept_${podanie.discordNick}`)
                    .setLabel('ZAAKCEPTUJ')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`reject_${podanie.discordNick}`)
                    .setLabel('ODRZUĆ')
                    .setStyle(ButtonStyle.Danger),
            );

        await hrChannel.send({ embeds: podanie.embeds, components: [row] });
        res.status(200).send({ message: 'Podanie wysłane sukcesem!' });

    } catch (error) {
        console.error('Błąd HTTP:', error);
        res.status(500).send({ error: 'Wystąpił błąd serwera.' });
    }
});

// 2. Obsługa komend ukośnikowych i przycisków
client.on('interactionCreate', async interaction => {
    
    // KOMENDA: /podania
    if (interaction.isChatInputCommand() && interaction.commandName === 'podania') {
        if (!interaction.memberPermissions.has('Administrator')) {
            return interaction.reply({ content: 'Tylko administrator może ustawiać kanały.', ephemeral: true });
        }

        const chPodania = interaction.options.getChannel('kanal_podan');
        const chWyniki = interaction.options.getChannel('kanal_wynikow');

        channelsConfig.podania = chPodania.id;
        channelsConfig.wyniki = chWyniki.id;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsConfig));

        await interaction.reply({ 
            content: `✅ Ustawiono pomyślnie!\n📝 Nowe podania trafią na: <#${chPodania.id}>\n📢 Wyniki będą ogłaszane na: <#${chWyniki.id}>`, 
            ephemeral: true 
        });
    }

    // KLIKNIĘCIE PRZYCISKU (Zarząd ocenia)
    if (interaction.isButton()) {
        const [action, discordNick] = interaction.customId.split('_');
        
        if (action === 'done') return; // Zabezpieczenie przed błędem zablokowanych przycisków

        if (!channelsConfig.wyniki) {
            return interaction.reply({ content: 'Zarząd musi najpierw ustawić kanał wyników komendą /podania!', ephemeral: true });
        }

        const wynikiChannel = await client.channels.fetch(channelsConfig.wyniki);

        // Wyłączamy przyciski na podaniu (zmieniamy je na "ZAAKCEPTOWANE" / "ODRZUCONE")
        const disabledRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('done_accept')
                    .setLabel(action === 'accept' ? 'ZAAKCEPTOWANE' : 'ZAAKCEPTUJ')
                    .setStyle(action === 'accept' ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('done_reject')
                    .setLabel(action === 'reject' ? 'ODRZUCONE' : 'ODRZUĆ')
                    .setStyle(action === 'reject' ? ButtonStyle.Danger : ButtonStyle.Secondary)
                    .setDisabled(true),
            );

        await interaction.update({ components: [disabledRow] });

        // Wysyłamy ogłoszenie na wybrany kanał
        const resultEmbed = new EmbedBuilder()
            .setTitle('🩺 DECYZJA REKRUTACYJNA EMS')
            .setDescription(`Podanie od gracza o nicku: **${discordNick}** zostało rozpatrzone.`)
            .addFields(
                { name: 'Status Rekrutacji:', value: action === 'accept' ? '✅ **PODANIE ZAAKCEPTOWANE**' : '❌ **PODANIE ODRZUCONE**' },
                { name: 'Rozpatrujący z Zarządu:', value: `<@${interaction.user.id}>` }
            )
            .setColor(action === 'accept' ? 0x10b981 : 0xef4444)
            .setTimestamp();

        await wynikiChannel.send({ embeds: [resultEmbed] });
    }
});

// 3. Uruchamianie bota i rejestracja komendy
client.once('ready', async () => {
    console.log(`Bot zalogowany jako ${client.user.tag}`);

    // Tworzenie komendy Slash na serwerze
    const data = {
        name: 'podania',
        description: 'Konfiguracja kanałów dla aplikacji rekrutacyjnej EMS',
        options: [
            {
                name: 'kanal_podan',
                type: 7, // Typ kanału Discord
                description: 'Kanał, na który bot ma wysyłać nowe podania ze strony',
                required: true,
            },
            {
                name: 'kanal_wynikow',
                type: 7, // Typ kanału Discord
                description: 'Kanał, na który trafi ostateczna decyzja (Przyjęty/Odrzucony)',
                required: true,
            }
        ]
    };
    await client.application.commands.set([data]);
    console.log('Zarejestrowano komendę /podania');
});

// Start
app.listen(PORT, () => {
    console.log(`Nasłuchuję API na porcie ${PORT}`);
    client.login(BOT_TOKEN);
});
