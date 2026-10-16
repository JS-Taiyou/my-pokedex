insert into pokemon (id, name, data_url, image_url) values
  (10326, 'meowstic-female-mega', 'https://pokeapi.co/api/v2/pokemon/10326/', 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/10326.png')
on conflict (id) do update set
  name = excluded.name,
  data_url = excluded.data_url,
  image_url = coalesce(pokemon.image_url, excluded.image_url);
