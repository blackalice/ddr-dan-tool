import React from 'react';
import Select from 'react-select';
import { FixedSizeList as List } from 'react-window';

const MenuList = ({ options, children, maxHeight, getValue }) => {
    const [value] = getValue();
    const initialOffset = options.indexOf(value) * 35;

    return (
        <List
            height={maxHeight}
            itemCount={children.length}
            itemSize={35}
            initialScrollOffset={initialOffset}
        >
            {({ index, style }) => <div style={style}>{children[index]}</div>}
        </List>
    );
};

const SongPicker = ({
    selectedGame,
    setSelectedGame,
    selectedSong,
    setSelectedSong,
    smData,
    songOptions,
    inputValue,
    setInputValue,
}) => {
    const selectStyles = {
        control: (styles) => ({ ...styles, backgroundColor: 'var(--card-bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-color)', padding: '0.3rem', borderRadius: '0.5rem' }),
        menu: (styles) => ({ ...styles, backgroundColor: 'var(--bg-color-light)', zIndex: 9999 }),
        option: (styles, { isFocused, isSelected }) => ({
            ...styles,
            backgroundColor: isSelected ? 'var(--card-hover-bg-color)' : isFocused ? 'var(--card-bg-color)' : null,
            color: 'var(--text-color)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        }),
        singleValue: (styles) => ({ 
            ...styles, 
            color: 'var(--text-color)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        }),
        input: (styles) => ({ ...styles, color: 'var(--text-color)' }),
    };

    return (
        <div className="app-container">
            <div className="controls-container">
                <select 
                    className="game-select"
                    value={selectedGame} 
                    onChange={(e) => {
                        setSelectedGame(e.target.value);
                        setSelectedSong(null);
                    }}
                >
                    <option value="all">All Games</option>
                    {smData.games.map(game => (
                        <option key={game} value={game}>{game}</option>
                    ))}
                </select>
                <div className="song-search-row">
                    <div className="song-select-container">
                        <Select
                            className="song-select"
                            options={songOptions}
                            value={selectedSong}
                            onChange={setSelectedSong}
                            styles={selectStyles}
                            placeholder="Search for a song..."
                            isClearable
                            components={{ MenuList }}
                            inputValue={inputValue}
                            onInputChange={setInputValue}
                            filterOption={(option, rawInput) => {
                                const { label, data } = option;
                                const { title, titleTranslit } = data;
                                const input = rawInput.toLowerCase();
                                return label.toLowerCase().includes(input) || 
                                       title.toLowerCase().includes(input) || 
                                       (titleTranslit && titleTranslit.toLowerCase().includes(input));
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SongPicker;
