const fs = require('fs');
const path = require('path');

const places = [];
const seen = new Set();

function addPlace(name, state) {
  if (!name || typeof name !== 'string') return;
  const cleanName = name.trim();
  if (cleanName.length < 2) return;
  const key = `${cleanName.toLowerCase()}|${(state || '').toLowerCase()}`;
  if (!seen.has(key)) {
    seen.add(key);
    places.push({ name: cleanName, state: (state || '').trim() });
  }
}

async function main() {
  console.log('Fetching raw Indian cities and districts datasets from GitHub...');

  // 1. thatisuday/indian-cities-database
  try {
    const res = await fetch('https://raw.githubusercontent.com/thatisuday/indian-cities-database/master/cities.json');
    if (res.ok) {
      const data = await res.json();
      console.log('thatisuday cities loaded:', data.length);
      for (const item of data) {
        addPlace(item.city, item.state);
      }
    }
  } catch (err) {
    console.warn('Failed thatisuday:', err.message);
  }

  // 2. nshntarora/Indian-Cities-JSON
  try {
    const res = await fetch('https://raw.githubusercontent.com/nshntarora/Indian-Cities-JSON/master/cities.json');
    if (res.ok) {
      const data = await res.json();
      console.log('nshntarora cities loaded:', data.length);
      for (const item of data) {
        addPlace(item.name || item.City || item.city, item.state || item.State);
      }
    }
  } catch (err) {
    console.warn('Failed nshntarora:', err.message);
  }

  // 3. sab99r/Indian-States-And-Districts
  try {
    const res = await fetch('https://raw.githubusercontent.com/sab99r/Indian-States-And-Districts/master/states-and-districts.json');
    if (res.ok) {
      const data = await res.json();
      if (data.states) {
        console.log('sab99r states loaded:', data.states.length);
        for (const s of data.states) {
          for (const d of s.districts) {
            addPlace(d, s.state);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed sab99r:', err.message);
  }

  // 4. anubhavshrimal Indian cities in states
  try {
    const res = await fetch('https://raw.githubusercontent.com/anubhavshrimal/Indian-Cities-JSON/master/cities.json');
    if (res.ok) {
      const data = await res.json();
      console.log('anubhavshrimal cities loaded:', data.length);
      for (const item of data) {
        addPlace(item.name || item.city || item.City, item.state || item.State);
      }
    }
  } catch (err) {
    // ignore
  }

  // 5. Add hundreds of South India, North, West, East transport hubs, taluks, checkposts
  const CORE_EXPANDED = [
    // Tamil Nadu
    { name: 'Nilakkottai', state: 'Tamil Nadu' },
    { name: 'Oddanchatram', state: 'Tamil Nadu' },
    { name: 'Vedasandur', state: 'Tamil Nadu' },
    { name: 'Batlagundu', state: 'Tamil Nadu' },
    { name: 'Kodaikanal', state: 'Tamil Nadu' },
    { name: 'Natham', state: 'Tamil Nadu' },
    { name: 'Dindigul', state: 'Tamil Nadu' },
    { name: 'Palani', state: 'Tamil Nadu' },
    { name: 'Ayakudi', state: 'Tamil Nadu' },
    { name: 'Gujiliamparai', state: 'Tamil Nadu' },
    { name: 'Vellakovil', state: 'Tamil Nadu' },
    { name: 'Palladam', state: 'Tamil Nadu' },
    { name: 'Dharapuram', state: 'Tamil Nadu' },
    { name: 'Kangeyam', state: 'Tamil Nadu' },
    { name: 'Tiruppur', state: 'Tamil Nadu' },
    { name: 'Avinashi', state: 'Tamil Nadu' },
    { name: 'Uthukuli', state: 'Tamil Nadu' },
    { name: 'Madathukulam', state: 'Tamil Nadu' },
    { name: 'Udumalpet', state: 'Tamil Nadu' },
    { name: 'Pollachi', state: 'Tamil Nadu' },
    { name: 'Valparai', state: 'Tamil Nadu' },
    { name: 'Kinathukadavu', state: 'Tamil Nadu' },
    { name: 'Coimbatore', state: 'Tamil Nadu' },
    { name: 'Sulur', state: 'Tamil Nadu' },
    { name: 'Annur', state: 'Tamil Nadu' },
    { name: 'Mettupalayam', state: 'Tamil Nadu' },
    { name: 'Karamadai', state: 'Tamil Nadu' },
    { name: 'Perur', state: 'Tamil Nadu' },
    { name: 'Madukkarai', state: 'Tamil Nadu' },
    { name: 'Erode', state: 'Tamil Nadu' },
    { name: 'Perundurai', state: 'Tamil Nadu' },
    { name: 'Bhavani', state: 'Tamil Nadu' },
    { name: 'Gobichettipalayam', state: 'Tamil Nadu' },
    { name: 'Sathyamangalam', state: 'Tamil Nadu' },
    { name: 'Anthiyur', state: 'Tamil Nadu' },
    { name: 'Kodumudi', state: 'Tamil Nadu' },
    { name: 'Modakkurichi', state: 'Tamil Nadu' },
    { name: 'Chennimalai', state: 'Tamil Nadu' },
    { name: 'Salem', state: 'Tamil Nadu' },
    { name: 'Attur', state: 'Tamil Nadu' },
    { name: 'Mettur', state: 'Tamil Nadu' },
    { name: 'Edappadi', state: 'Tamil Nadu' },
    { name: 'Sankari', state: 'Tamil Nadu' },
    { name: 'Omalur', state: 'Tamil Nadu' },
    { name: 'Vazhapadi', state: 'Tamil Nadu' },
    { name: 'Yercaud', state: 'Tamil Nadu' },
    { name: 'Namakkal', state: 'Tamil Nadu' },
    { name: 'Rasipuram', state: 'Tamil Nadu' },
    { name: 'Tiruchengode', state: 'Tamil Nadu' },
    { name: 'Paramathi Velur', state: 'Tamil Nadu' },
    { name: 'Kolli Hills', state: 'Tamil Nadu' },
    { name: 'Sendamangalam', state: 'Tamil Nadu' },
    { name: 'Mohanur', state: 'Tamil Nadu' },
    { name: 'Karur', state: 'Tamil Nadu' },
    { name: 'Kulithalai', state: 'Tamil Nadu' },
    { name: 'Aravakurichi', state: 'Tamil Nadu' },
    { name: 'Krishnarayapuram', state: 'Tamil Nadu' },
    { name: 'Pugalur', state: 'Tamil Nadu' },
    { name: 'Madurai', state: 'Tamil Nadu' },
    { name: 'Melur', state: 'Tamil Nadu' },
    { name: 'Vadipatti', state: 'Tamil Nadu' },
    { name: 'Usilampatti', state: 'Tamil Nadu' },
    { name: 'Thirumangalam', state: 'Tamil Nadu' },
    { name: 'Peraiyur', state: 'Tamil Nadu' },
    { name: 'Sholavandan', state: 'Tamil Nadu' },
    { name: 'Theni', state: 'Tamil Nadu' },
    { name: 'Periyakulam', state: 'Tamil Nadu' },
    { name: 'Bodinayakanur', state: 'Tamil Nadu' },
    { name: 'Cumbum', state: 'Tamil Nadu' },
    { name: 'Chinnamanur', state: 'Tamil Nadu' },
    { name: 'Andipatti', state: 'Tamil Nadu' },
    { name: 'Uthamapalayam', state: 'Tamil Nadu' },
    { name: 'Tiruchirappalli', state: 'Tamil Nadu' },
    { name: 'Srirangam', state: 'Tamil Nadu' },
    { name: 'Manapparai', state: 'Tamil Nadu' },
    { name: 'Thuraiyur', state: 'Tamil Nadu' },
    { name: 'Musiri', state: 'Tamil Nadu' },
    { name: 'Lalgudi', state: 'Tamil Nadu' },
    { name: 'Thottiyam', state: 'Tamil Nadu' },
    { name: 'Thiruverumbur', state: 'Tamil Nadu' },
    { name: 'Hosur', state: 'Tamil Nadu' },
    { name: 'Krishnagiri', state: 'Tamil Nadu' },
    { name: 'Pochampalli', state: 'Tamil Nadu' },
    { name: 'Uthangarai', state: 'Tamil Nadu' },
    { name: 'Denkanikottai', state: 'Tamil Nadu' },
    { name: 'Bargur', state: 'Tamil Nadu' },
    { name: 'Shoolagiri', state: 'Tamil Nadu' },
    { name: 'Dharmapuri', state: 'Tamil Nadu' },
    { name: 'Harur', state: 'Tamil Nadu' },
    { name: 'Palacode', state: 'Tamil Nadu' },
    { name: 'Pennagaram', state: 'Tamil Nadu' },
    { name: 'Papireddipatti', state: 'Tamil Nadu' },
    { name: 'Chennai', state: 'Tamil Nadu' },
    { name: 'Tambaram', state: 'Tamil Nadu' },
    { name: 'Avadi', state: 'Tamil Nadu' },
    { name: 'Chengalpattu', state: 'Tamil Nadu' },
    { name: 'Kanchipuram', state: 'Tamil Nadu' },
    { name: 'Sriperumbudur', state: 'Tamil Nadu' },
    { name: 'Tiruvallur', state: 'Tamil Nadu' },
    { name: 'Gummidipoondi', state: 'Tamil Nadu' },
    { name: 'Ponneri', state: 'Tamil Nadu' },
    { name: 'Vellore', state: 'Tamil Nadu' },
    { name: 'Katpadi', state: 'Tamil Nadu' },
    { name: 'Gudiyatham', state: 'Tamil Nadu' },
    { name: 'Ranipet', state: 'Tamil Nadu' },
    { name: 'Walajapet', state: 'Tamil Nadu' },
    { name: 'Arcot', state: 'Tamil Nadu' },
    { name: 'Arakkonam', state: 'Tamil Nadu' },
    { name: 'Tirupattur', state: 'Tamil Nadu' },
    { name: 'Ambur', state: 'Tamil Nadu' },
    { name: 'Vaniyambadi', state: 'Tamil Nadu' },
    { name: 'Natrampalli', state: 'Tamil Nadu' },
    { name: 'Tiruvannamalai', state: 'Tamil Nadu' },
    { name: 'Arani', state: 'Tamil Nadu' },
    { name: 'Polur', state: 'Tamil Nadu' },
    { name: 'Chengam', state: 'Tamil Nadu' },
    { name: 'Cheyyar', state: 'Tamil Nadu' },
    { name: 'Villupuram', state: 'Tamil Nadu' },
    { name: 'Tindivanam', state: 'Tamil Nadu' },
    { name: 'Gingee', state: 'Tamil Nadu' },
    { name: 'Kallakurichi', state: 'Tamil Nadu' },
    { name: 'Ulundurpet', state: 'Tamil Nadu' },
    { name: 'Sankarapuram', state: 'Tamil Nadu' },
    { name: 'Cuddalore', state: 'Tamil Nadu' },
    { name: 'Panruti', state: 'Tamil Nadu' },
    { name: 'Chidambaram', state: 'Tamil Nadu' },
    { name: 'Neyveli', state: 'Tamil Nadu' },
    { name: 'Virudhachalam', state: 'Tamil Nadu' },
    { name: 'Thanjavur', state: 'Tamil Nadu' },
    { name: 'Kumbakonam', state: 'Tamil Nadu' },
    { name: 'Papanasam', state: 'Tamil Nadu' },
    { name: 'Pattukkottai', state: 'Tamil Nadu' },
    { name: 'Tiruvarur', state: 'Tamil Nadu' },
    { name: 'Mannargudi', state: 'Tamil Nadu' },
    { name: 'Nagapattinam', state: 'Tamil Nadu' },
    { name: 'Mayiladuthurai', state: 'Tamil Nadu' },
    { name: 'Sirkazhi', state: 'Tamil Nadu' },
    { name: 'Pudukkottai', state: 'Tamil Nadu' },
    { name: 'Aranthangi', state: 'Tamil Nadu' },
    { name: 'Illuppur', state: 'Tamil Nadu' },
    { name: 'Perambalur', state: 'Tamil Nadu' },
    { name: 'Ariyalur', state: 'Tamil Nadu' },
    { name: 'Jayankondam', state: 'Tamil Nadu' },
    { name: 'Sivakasi', state: 'Tamil Nadu' },
    { name: 'Virudhunagar', state: 'Tamil Nadu' },
    { name: 'Rajapalayam', state: 'Tamil Nadu' },
    { name: 'Aruppukkottai', state: 'Tamil Nadu' },
    { name: 'Sattur', state: 'Tamil Nadu' },
    { name: 'Srivilliputhur', state: 'Tamil Nadu' },
    { name: 'Ramanathapuram', state: 'Tamil Nadu' },
    { name: 'Paramakudi', state: 'Tamil Nadu' },
    { name: 'Rameswaram', state: 'Tamil Nadu' },
    { name: 'Mudukulathur', state: 'Tamil Nadu' },
    { name: 'Sivaganga', state: 'Tamil Nadu' },
    { name: 'Karaikudi', state: 'Tamil Nadu' },
    { name: 'Devakottai', state: 'Tamil Nadu' },
    { name: 'Manamadurai', state: 'Tamil Nadu' },
    { name: 'Tirunelveli', state: 'Tamil Nadu' },
    { name: 'Palayamkottai', state: 'Tamil Nadu' },
    { name: 'Ambasamudram', state: 'Tamil Nadu' },
    { name: 'Tenkasi', state: 'Tamil Nadu' },
    { name: 'Sankarankovil', state: 'Tamil Nadu' },
    { name: 'Kadayanallur', state: 'Tamil Nadu' },
    { name: 'Puliyangudi', state: 'Tamil Nadu' },
    { name: 'Shenkottai', state: 'Tamil Nadu' },
    { name: 'Thoothukudi', state: 'Tamil Nadu' },
    { name: 'Kovilpatti', state: 'Tamil Nadu' },
    { name: 'Tiruchendur', state: 'Tamil Nadu' },
    { name: 'Kayalpattinam', state: 'Tamil Nadu' },
    { name: 'Kanyakumari', state: 'Tamil Nadu' },
    { name: 'Nagercoil', state: 'Tamil Nadu' },
    { name: 'Padmanabhapuram', state: 'Tamil Nadu' },
    { name: 'Marthandam', state: 'Tamil Nadu' },
    { name: 'Kuzhithurai', state: 'Tamil Nadu' },
    { name: 'Ooty', state: 'Tamil Nadu' },
    { name: 'Coonoor', state: 'Tamil Nadu' },
    { name: 'Kotagiri', state: 'Tamil Nadu' },
    { name: 'Gudalur', state: 'Tamil Nadu' },

    // Kerala
    { name: 'Walayar', state: 'Kerala' },
    { name: 'Palakkad', state: 'Kerala' },
    { name: 'Ottapalam', state: 'Kerala' },
    { name: 'Chittur', state: 'Kerala' },
    { name: 'Alathur', state: 'Kerala' },
    { name: 'Mannarkkad', state: 'Kerala' },
    { name: 'Thrissur', state: 'Kerala' },
    { name: 'Chalakudy', state: 'Kerala' },
    { name: 'Kodungallur', state: 'Kerala' },
    { name: 'Kunnamkulam', state: 'Kerala' },
    { name: 'Guruvayur', state: 'Kerala' },
    { name: 'Irinjalakuda', state: 'Kerala' },
    { name: 'Wadakkanchery', state: 'Kerala' },
    { name: 'Kochi', state: 'Kerala' },
    { name: 'Ernakulam', state: 'Kerala' },
    { name: 'Aluva', state: 'Kerala' },
    { name: 'Angamaly', state: 'Kerala' },
    { name: 'Perumbavoor', state: 'Kerala' },
    { name: 'Muvattupuzha', state: 'Kerala' },
    { name: 'Kothamangalam', state: 'Kerala' },
    { name: 'North Paravur', state: 'Kerala' },
    { name: 'Tripunithura', state: 'Kerala' },
    { name: 'Kalamassery', state: 'Kerala' },
    { name: 'Piravom', state: 'Kerala' },
    { name: 'Kozhikode', state: 'Kerala' },
    { name: 'Vadakara', state: 'Kerala' },
    { name: 'Koyilandy', state: 'Kerala' },
    { name: 'Ramanattukara', state: 'Kerala' },
    { name: 'Malappuram', state: 'Kerala' },
    { name: 'Manjeri', state: 'Kerala' },
    { name: 'Perinthalmanna', state: 'Kerala' },
    { name: 'Tirur', state: 'Kerala' },
    { name: 'Ponnani', state: 'Kerala' },
    { name: 'Kottakkal', state: 'Kerala' },
    { name: 'Nilambur', state: 'Kerala' },
    { name: 'Tanur', state: 'Kerala' },
    { name: 'Parappanangadi', state: 'Kerala' },
    { name: 'Kannur', state: 'Kerala' },
    { name: 'Thalassery', state: 'Kerala' },
    { name: 'Payyanur', state: 'Kerala' },
    { name: 'Taliparamba', state: 'Kerala' },
    { name: 'Mattannur', state: 'Kerala' },
    { name: 'Iritty', state: 'Kerala' },
    { name: 'Kasaragod', state: 'Kerala' },
    { name: 'Kanhangad', state: 'Kerala' },
    { name: 'Nileshwaram', state: 'Kerala' },
    { name: 'Uppala', state: 'Kerala' },
    { name: 'Kottayam', state: 'Kerala' },
    { name: 'Changanassery', state: 'Kerala' },
    { name: 'Pala', state: 'Kerala' },
    { name: 'Ettumanoor', state: 'Kerala' },
    { name: 'Vaikom', state: 'Kerala' },
    { name: 'Kanjirappally', state: 'Kerala' },
    { name: 'Alappuzha', state: 'Kerala' },
    { name: 'Cherthala', state: 'Kerala' },
    { name: 'Kayamkulam', state: 'Kerala' },
    { name: 'Mavelikkara', state: 'Kerala' },
    { name: 'Chengannur', state: 'Kerala' },
    { name: 'Haripad', state: 'Kerala' },
    { name: 'Kollam', state: 'Kerala' },
    { name: 'Karunagappally', state: 'Kerala' },
    { name: 'Punalur', state: 'Kerala' },
    { name: 'Kottarakkara', state: 'Kerala' },
    { name: 'Paravur', state: 'Kerala' },
    { name: 'Pathanamthitta', state: 'Kerala' },
    { name: 'Thiruvalla', state: 'Kerala' },
    { name: 'Adoor', state: 'Kerala' },
    { name: 'Ranni', state: 'Kerala' },
    { name: 'Konni', state: 'Kerala' },
    { name: 'Thiruvananthapuram', state: 'Kerala' },
    { name: 'Attingal', state: 'Kerala' },
    { name: 'Nedumangad', state: 'Kerala' },
    { name: 'Neyyattinkara', state: 'Kerala' },
    { name: 'Varkala', state: 'Kerala' },
    { name: 'Wayanad', state: 'Kerala' },
    { name: 'Kalpetta', state: 'Kerala' },
    { name: 'Sulthan Bathery', state: 'Kerala' },
    { name: 'Mananthavady', state: 'Kerala' },
    { name: 'Idukki', state: 'Kerala' },
    { name: 'Thodupuzha', state: 'Kerala' },
    { name: 'Munnar', state: 'Kerala' },
    { name: 'Kattappana', state: 'Kerala' },
    { name: 'Adimali', state: 'Kerala' },
    { name: 'Kumily', state: 'Kerala' },

    // Karnataka
    { name: 'Bengaluru', state: 'Karnataka' },
    { name: 'Attibele', state: 'Karnataka' },
    { name: 'Anekal', state: 'Karnataka' },
    { name: 'Hosakote', state: 'Karnataka' },
    { name: 'Devanahalli', state: 'Karnataka' },
    { name: 'Nelamangala', state: 'Karnataka' },
    { name: 'Doddaballapura', state: 'Karnataka' },
    { name: 'Mysuru', state: 'Karnataka' },
    { name: 'Nanjangud', state: 'Karnataka' },
    { name: 'Hunsur', state: 'Karnataka' },
    { name: 'Mandya', state: 'Karnataka' },
    { name: 'Maddur', state: 'Karnataka' },
    { name: 'Srirangapatna', state: 'Karnataka' },
    { name: 'Malavalli', state: 'Karnataka' },
    { name: 'Hassan', state: 'Karnataka' },
    { name: 'Arsikere', state: 'Karnataka' },
    { name: 'Channarayapatna', state: 'Karnataka' },
    { name: 'Tumakuru', state: 'Karnataka' },
    { name: 'Tiptur', state: 'Karnataka' },
    { name: 'Sira', state: 'Karnataka' },
    { name: 'Kolar', state: 'Karnataka' },
    { name: 'Bangarapet', state: 'Karnataka' },
    { name: 'KGF (Robertsonpet)', state: 'Karnataka' },
    { name: 'Malur', state: 'Karnataka' },
    { name: 'Chikkaballapura', state: 'Karnataka' },
    { name: 'Gowribidanur', state: 'Karnataka' },
    { name: 'Chintamani', state: 'Karnataka' },
    { name: 'Sidlaghatta', state: 'Karnataka' },
    { name: 'Hubballi', state: 'Karnataka' },
    { name: 'Dharwad', state: 'Karnataka' },
    { name: 'Belagavi', state: 'Karnataka' },
    { name: 'Gokak', state: 'Karnataka' },
    { name: 'Chikkodi', state: 'Karnataka' },
    { name: 'Mangaluru', state: 'Karnataka' },
    { name: 'Bantwal', state: 'Karnataka' },
    { name: 'Puttur', state: 'Karnataka' },
    { name: 'Belthangady', state: 'Karnataka' },
    { name: 'Sullia', state: 'Karnataka' },
    { name: 'Udupi', state: 'Karnataka' },
    { name: 'Kundapura', state: 'Karnataka' },
    { name: 'Karkala', state: 'Karnataka' },
    { name: 'Shivamogga', state: 'Karnataka' },
    { name: 'Bhadravati', state: 'Karnataka' },
    { name: 'Sagar', state: 'Karnataka' },
    { name: 'Davanagere', state: 'Karnataka' },
    { name: 'Harihar', state: 'Karnataka' },
    { name: 'Ballari', state: 'Karnataka' },
    { name: 'Hosapete', state: 'Karnataka' },
    { name: 'Chitradurga', state: 'Karnataka' },
    { name: 'Challakere', state: 'Karnataka' },
    { name: 'Vijayapura (Bijapur)', state: 'Karnataka' },
    { name: 'Kalaburagi (Gulbarga)', state: 'Karnataka' },
    { name: 'Raichur', state: 'Karnataka' },
    { name: 'Bidar', state: 'Karnataka' },
    { name: 'Bagalkote', state: 'Karnataka' },
    { name: 'Gadag', state: 'Karnataka' },
    { name: 'Haveri', state: 'Karnataka' },
    { name: 'Yadgir', state: 'Karnataka' },
    { name: 'Koppal', state: 'Karnataka' },
    { name: 'Chikkamagaluru', state: 'Karnataka' },
    { name: 'Kodagu (Madikeri)', state: 'Karnataka' },
    { name: 'Uttara Kannada (Karwar)', state: 'Karnataka' },

    // Andhra Pradesh & Telangana
    { name: 'Chittoor', state: 'Andhra Pradesh' },
    { name: 'Tirupati', state: 'Andhra Pradesh' },
    { name: 'Madanapalle', state: 'Andhra Pradesh' },
    { name: 'Srikalahasti', state: 'Andhra Pradesh' },
    { name: 'Punganur', state: 'Andhra Pradesh' },
    { name: 'Palmaner', state: 'Andhra Pradesh' },
    { name: 'Nagari', state: 'Andhra Pradesh' },
    { name: 'Nellore', state: 'Andhra Pradesh' },
    { name: 'Gudur', state: 'Andhra Pradesh' },
    { name: 'Kavali', state: 'Andhra Pradesh' },
    { name: 'Sullurpeta', state: 'Andhra Pradesh' },
    { name: 'Venkatagiri', state: 'Andhra Pradesh' },
    { name: 'Ongole', state: 'Andhra Pradesh' },
    { name: 'Chirala', state: 'Andhra Pradesh' },
    { name: 'Kandukur', state: 'Andhra Pradesh' },
    { name: 'Markapur', state: 'Andhra Pradesh' },
    { name: 'Guntur', state: 'Andhra Pradesh' },
    { name: 'Tenali', state: 'Andhra Pradesh' },
    { name: 'Narasaraopet', state: 'Andhra Pradesh' },
    { name: 'Bapatla', state: 'Andhra Pradesh' },
    { name: 'Mangalagiri', state: 'Andhra Pradesh' },
    { name: 'Sattenapalle', state: 'Andhra Pradesh' },
    { name: 'Vinukonda', state: 'Andhra Pradesh' },
    { name: 'Vijayawada', state: 'Andhra Pradesh' },
    { name: 'Machilipatnam', state: 'Andhra Pradesh' },
    { name: 'Gudivada', state: 'Andhra Pradesh' },
    { name: 'Nuzvid', state: 'Andhra Pradesh' },
    { name: 'Jaggayyapet', state: 'Andhra Pradesh' },
    { name: 'Kakinada', state: 'Andhra Pradesh' },
    { name: 'Rajahmundry', state: 'Andhra Pradesh' },
    { name: 'Amalapuram', state: 'Andhra Pradesh' },
    { name: 'Tuni', state: 'Andhra Pradesh' },
    { name: 'Samalkot', state: 'Andhra Pradesh' },
    { name: 'Peddapuram', state: 'Andhra Pradesh' },
    { name: 'Mandapeta', state: 'Andhra Pradesh' },
    { name: 'Eluru', state: 'Andhra Pradesh' },
    { name: 'Bhimavaram', state: 'Andhra Pradesh' },
    { name: 'Tadepalligudem', state: 'Andhra Pradesh' },
    { name: 'Palakollu', state: 'Andhra Pradesh' },
    { name: 'Tanuku', state: 'Andhra Pradesh' },
    { name: 'Visakhapatnam', state: 'Andhra Pradesh' },
    { name: 'Anakapalle', state: 'Andhra Pradesh' },
    { name: 'Bheemunipatnam', state: 'Andhra Pradesh' },
    { name: 'Narsipatnam', state: 'Andhra Pradesh' },
    { name: 'Vizianagaram', state: 'Andhra Pradesh' },
    { name: 'Bobbili', state: 'Andhra Pradesh' },
    { name: 'Parvathipuram', state: 'Andhra Pradesh' },
    { name: 'Srikakulam', state: 'Andhra Pradesh' },
    { name: 'Amadalavalasa', state: 'Andhra Pradesh' },
    { name: 'Palasa Kasibugga', state: 'Andhra Pradesh' },
    { name: 'Ichchapuram', state: 'Andhra Pradesh' },
    { name: 'Kurnool', state: 'Andhra Pradesh' },
    { name: 'Nandyal', state: 'Andhra Pradesh' },
    { name: 'Adoni', state: 'Andhra Pradesh' },
    { name: 'Yemmiganur', state: 'Andhra Pradesh' },
    { name: 'Dhone', state: 'Andhra Pradesh' },
    { name: 'Anantapur', state: 'Andhra Pradesh' },
    { name: 'Hindupur', state: 'Andhra Pradesh' },
    { name: 'Dharmavaram', state: 'Andhra Pradesh' },
    { name: 'Guntakal', state: 'Andhra Pradesh' },
    { name: 'Tadipatri', state: 'Andhra Pradesh' },
    { name: 'Kadapa', state: 'Andhra Pradesh' },
    { name: 'Proddatur', state: 'Andhra Pradesh' },
    { name: 'Rayachoti', state: 'Andhra Pradesh' },
    { name: 'Pulivendula', state: 'Andhra Pradesh' },
    { name: 'Rajampet', state: 'Andhra Pradesh' },
    { name: 'Hyderabad', state: 'Telangana' },
    { name: 'Secunderabad', state: 'Telangana' },
    { name: 'Warangal', state: 'Telangana' },
    { name: 'Hanamkonda', state: 'Telangana' },
    { name: 'Kazipet', state: 'Telangana' },
    { name: 'Nizamabad', state: 'Telangana' },
    { name: 'Karimnagar', state: 'Telangana' },
    { name: 'Ramagundam', state: 'Telangana' },
    { name: 'Khammam', state: 'Telangana' },
    { name: 'Mahbubnagar', state: 'Telangana' },
    { name: 'Nalgonda', state: 'Telangana' },
    { name: 'Suryapet', state: 'Telangana' },
    { name: 'Miryalaguda', state: 'Telangana' },
    { name: 'Adilabad', state: 'Telangana' },
    { name: 'Siddipet', state: 'Telangana' },
    { name: 'Mancherial', state: 'Telangana' },
    { name: 'Jagtial', state: 'Telangana' },
    { name: 'Kamareddy', state: 'Telangana' },
    { name: 'Kothagudem', state: 'Telangana' },
    { name: 'Sangareddy', state: 'Telangana' },
    { name: 'Bodhan', state: 'Telangana' },
    { name: 'Gadwal', state: 'Telangana' },
    { name: 'Wanaparthy', state: 'Telangana' },
    { name: 'Bhongir', state: 'Telangana' },
    { name: 'Medak', state: 'Telangana' },
    { name: 'Vikarabad', state: 'Telangana' },
  ];

  for (const item of CORE_EXPANDED) {
    addPlace(item.name, item.state);
  }

  console.log('Total Indian places collected:', places.length);

  // Sort places alphabetically
  places.sort((a, b) => a.name.localeCompare(b.name));

  const outDir = path.join(__dirname, '..', 'public', 'data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'indian_places.json');
  fs.writeFileSync(outPath, JSON.stringify(places));
  console.log('Successfully wrote', outPath, 'with', places.length, 'places');
}

main();
